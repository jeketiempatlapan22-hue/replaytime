import { enrichAccessMessage } from '../_shared/group-link.ts';
import { primeReplayHost, rewriteReplay } from '../_shared/replay-origin.ts';
// Pakasir webhook: konfirmasi pembayaran QRIS dinamis, lalu kirim token via Fonnte.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { waDedupKey, claimWaSend, markWaSent } from '../_shared/wa-guard.ts';
import { sendTelegramByPhone } from '../_shared/telegram.ts';
import { verifyPakasirPaidStrict, PAID_STATUSES as STRICT_PAID_STATUSES } from '../_shared/pakasir.ts';
import { issueBundleToken } from '../_shared/bundle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string) {
  const d = String(raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('62')) return d;
  if (d.startsWith('8')) return '62' + d;
  return d;
}

function genToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

const PAID_STATUSES = STRICT_PAID_STATUSES;

async function verifyPakasirPaid(apiKey: string, slug: string, pakasirOrderId: string, amount: number) {
  return await verifyPakasirPaidStrict(apiKey, slug, pakasirOrderId, amount, 12000);
}

// Provision a fresh single-device token row for this paid order.
// Always issues a brand-new token (never reuses a stale order.access_token)
// and writes the matching row into active_show_tokens / replay_personal_tokens
// with max_devices = 1. Idempotent: if a row already exists for the order's
// current token, returns it as-is.
async function ensurePurchaseToken(admin: ReturnType<typeof createClient>, order: any): Promise<string> {
  if (order.kind === 'bundle') {
    const issued = await issueBundleToken(admin, {
      userId: order.user_id || null,
      phone: order.user_phone || null,
      orderId: order.id || null,
      label: `pakasir:${order.user_phone || ''}`.slice(0, 120),
    });
    return issued?.token || order.access_token || '';
  }
  if (order.access_token) {
    if (order.show_id && !order.replay_id) {
      const { data: existing } = await admin
        .from('active_show_tokens').select('id')
        .eq('show_id', order.show_id).eq('token', order.access_token).maybeSingle();
      if (existing) return order.access_token;
    } else if (order.replay_id) {
      const { data: existing } = await admin
        .from('replay_personal_tokens').select('id')
        .eq('replay_id', order.replay_id).eq('token', order.access_token).maybeSingle();
      if (existing) return order.access_token;
    }
  }
  const newTok = genToken();
  if (order.show_id && !order.replay_id) {
    await admin.from('active_show_tokens').insert({
      show_id: order.show_id, token: newTok,
      label: `pakasir:${order.user_phone || ''}`.slice(0, 120),
      kind: 'personal', max_devices: 1, revoked: false,
    });
  } else if (order.replay_id) {
    await admin.from('replay_personal_tokens').insert({
      replay_id: order.replay_id, token: newTok,
      label: `pakasir:${order.user_phone || ''}`.slice(0, 120),
      max_devices: 1, revoked: false,
    });
  }
  return newTok;
}

async function sendFonnteOnce(phone: string, message: string, timeoutMs: number) {
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) return { ok: false, data: { error: 'no token' } };
  const target = normalizePhone(phone);
  if (!/^628\d{8,11}$/.test(target)) return { ok: false, data: { error: 'invalid_phone_for_fonnte', target } };
  const form = new FormData();
  form.append('target', target);
  form.append('message', message);
  form.append('countryCode', '62');
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST', headers: { Authorization: token }, body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && (data as { status?: boolean })?.status !== false, data };
  } catch (e) {
    return { ok: false, data: { error: String(e) } };
  }
}

async function sendFonnte(phone: string, message: string) {
  const groupAdmin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  message = rewriteReplay(await enrichAccessMessage(groupAdmin, message));
  // Guard anti-spam: hanya satu proses yang boleh mengirim pesan identik ke
  // nomor yang sama dalam 15 menit (webhook + polling bisa jalan bersamaan).
  const dedupKey = await waDedupKey(phone, message);
  if (!(await claimWaSend(dedupKey))) {
    return { ok: true, data: { skipped: 'duplicate_suppressed' }, duplicate: true } as { ok: boolean; data: unknown; duplicate?: boolean };
  }
  const attempts = [10000, 20000, 32000];
  let last: { ok: boolean; data: unknown } = { ok: false, data: { error: 'no_attempt' } };
  for (let i = 0; i < attempts.length; i++) {
    last = await sendFonnteOnce(phone, message, attempts[i]);
    if (last.ok) { await markWaSent(dedupKey); return last; }
  }
  return last;
}

async function hasSentWa(admin: ReturnType<typeof createClient>, orderId: string) {
  const { data } = await admin.from('wa_outbox')
    .select('id').eq('related_order_id', orderId).eq('status', 'sent').limit(1);
  return !!data?.length;
}

function isTimeoutText(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return /timed out|TimeoutError|Signal timed out|abort/i.test(text);
}

async function isFonntePaused(admin: ReturnType<typeof createClient>, windowMs = 15 * 60_000) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data } = await admin.from('wa_outbox')
    .select('status,error,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10);
  const rows = data ?? [];
  const timeoutFails = rows.filter((r: any) => r.status === 'failed' && isTimeoutText(r.error)).length;
  const hasRecentSent = rows.some((r: any) => r.status === 'sent');
  return timeoutFails >= 3 && !hasRecentSent;
}

Deno.serve(async (req) => {
  await primeReplayHost();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const expectedKey = Deno.env.get('PAKASIR_API_KEY');
  const expectedSlug = Deno.env.get('PAKASIR_PROJECT_SLUG');

  // Fail closed: webhook MUST be authenticated. If the API key secret isn't configured,
  // refuse all requests rather than accepting unauthenticated payment confirmations.
  if (!expectedKey) {
    return new Response(JSON.stringify({ error: 'webhook not configured' }), { status: 503, headers: corsHeaders });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }

  // Pakasir typically sends: order_id, amount, status, project, api_key, payment_method, completed_at
  const apiKey = String(body.api_key ?? req.headers.get('x-api-key') ?? '');
  const project = String(body.project ?? '');
  if (apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: 'invalid api key' }), { status: 401, headers: corsHeaders });
  }
  if (expectedSlug && project && project !== expectedSlug) {
    return new Response(JSON.stringify({ error: 'invalid project' }), { status: 401, headers: corsHeaders });
  }

  const orderId = String(body.order_id ?? '');
  const status = String(body.status ?? '').toLowerCase();
  if (!orderId) return new Response(JSON.stringify({ error: 'missing order_id' }), { status: 400, headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // ===== MEMBERSHIP ORDER branch (separate table) =====
  const { data: mOrder } = await admin
    .from('membership_orders').select('*').eq('pakasir_order_id', orderId).maybeSingle();
  if (mOrder) {
    if (!PAID_STATUSES.has(status)) {
      return new Response(JSON.stringify({ ok: true, ignored: true, status }), { headers: corsHeaders });
    }
    const verified = await verifyPakasirPaid(expectedKey, expectedSlug || project, orderId, Number(mOrder.amount || 0));
    if (!verified.paid) {
      return new Response(JSON.stringify({ ok: true, ignored: true, status: verified.status, verified: false }), { headers: corsHeaders });
    }
    if (mOrder.status === 'paid' && mOrder.membership_token_id) {
      return new Response(JSON.stringify({ ok: true, already: true }), { headers: corsHeaders });
    }
    // Finalize → issue membership token
    const { data: fin, error: ferr } = await admin.rpc('finalize_membership_order', { _order_id: mOrder.id });
    if (ferr) {
      return new Response(JSON.stringify({ error: 'finalize_failed', detail: ferr.message }), { status: 500, headers: corsHeaders });
    }
    const tok = Array.isArray(fin) ? fin[0] : fin;

    const { data: settings } = await admin
      .from('site_settings').select('key,value').in('key', ['site_origin','wa_membership_template']);
    const sm = new Map((settings ?? []).map((s) => [s.key, s.value]));
    const origin = (sm.get('site_origin') || 'https://realtime48show.my.id').replace(/\/+$/, '');
    const tpl = sm.get('wa_membership_template') ||
      '👑 *MEMBERSHIP AKTIF*\n\n📦 *{package_name}*\n📅 Berlaku hingga: {expires_at}\n\n🔗 *Link Akses:*\n{link}\n\n🎬 *Link Replay:* realtime48show.my.id\n\n{replay_info_block}👤 Berlaku untuk *{max_devices} perangkat*.\n\n— *ReplayTime* 💖';
    const link = `${origin}/live?mtoken=${encodeURIComponent(tok.token)}&mp=${encodeURIComponent(tok.password)}`;
    const expiresStr = new Date(tok.expires_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const msg = tpl
      .replace(/\{package_name\}/g, tok.package_name || '')
      .replace(/\{link\}/g, link)
      .replace(/\{password\}/g, tok.password || '')
      .replace(/\{expires_at\}/g, expiresStr)
      .replace(/\{duration_days\}/g, String(tok.duration_days || ''))
      .replace(/\{max_devices\}/g, String(tok.max_devices || 1))
      .replace(/\{replay_info\}/g, tok.replay_info || '')
      .replace(/\{replay_info_block\}/g, tok.replay_info ? `🎬 *Info Replay:*\n${tok.replay_info}\n\n` : '')
      .replace(/\{site\}/g, origin.replace(/^https?:\/\//, ''));
    // Idempotency guard: only one worker dispatches WA per membership order.
    const claimAt = new Date().toISOString();
    const { data: claimed } = await admin.from('membership_orders')
      .update({ wa_last_attempt_at: claimAt })
      .eq('id', mOrder.id).is('wa_sent_at', null).select('id');
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ ok: true, membership: true, already_sent: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const paused = await isFonntePaused(admin);
    const sent = paused ? { ok: false, data: { error: 'fonnte_timeout_pause' } } : await sendFonnte(mOrder.phone, msg);
    const nowIso = new Date().toISOString();
    await admin.from('membership_orders').update({
      wa_attempts: (Number(mOrder.wa_attempts) || 0) + 1,
      wa_last_attempt_at: nowIso,
      wa_last_error: sent.ok ? null : JSON.stringify(sent.data).slice(0, 500),
      wa_sent_at: sent.ok ? nowIso : null,
    }).eq('id', mOrder.id);
    await admin.from('wa_outbox').insert({
      phone: mOrder.phone, message: msg, status: sent.ok ? 'sent' : 'failed',
      error: sent.ok ? null : JSON.stringify(sent.data),
      related_order_id: mOrder.id,
      fonnte_response: sent.data as Record<string, unknown>,
    });
    if (sent.ok) {
      await admin.from('token_deliveries').insert({
        phone: mOrder.phone, replay_id: null, replay_title: `Membership • ${tok.package_name}`,
        order_id: null, access_token: tok.token, link,
        source: 'pakasir', requested_by: 'pakasir-webhook-membership',
      });
    }
    return new Response(JSON.stringify({ ok: true, membership: true, sent: sent.ok }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: order } = await admin
    .from('orders').select('*').eq('pakasir_order_id', orderId).maybeSingle();

  if (!order) {
    return new Response(JSON.stringify({ error: 'order not found' }), { status: 404, headers: corsHeaders });
  }

  if (!PAID_STATUSES.has(status)) {
    await admin.from('orders').update({ status }).eq('id', order.id);
    return new Response(JSON.stringify({ ok: true, ignored: true, status }), { headers: corsHeaders });
  }

  const verified = await verifyPakasirPaid(expectedKey, expectedSlug || project, orderId, Number(order.amount || 0));
  if (!verified.paid) {
    return new Response(JSON.stringify({ ok: true, ignored: true, status: verified.status, verified: false }), { headers: corsHeaders });
  }

  // Idempotent: skip only when paid and WA was actually sent.
  const alreadySent = order.token_sent_at && await hasSentWa(admin, order.id);
  if (order.status === 'paid' && alreadySent) {
    return new Response(JSON.stringify({ ok: true, already: true }), { headers: corsHeaders });
  }
  if (order.token_sent_at && !alreadySent) {
    await admin.from('orders').update({ token_sent_at: null }).eq('id', order.id);
    order.token_sent_at = null;
  }


  // === COIN TOP-UP branch ===
  if (order.kind === 'coin_topup') {
    let newBal: number | null = null;
    if (order.user_id && order.coin_amount > 0) {
      const { data: credited, error: gerr } = await admin.rpc('credit_coin_topup_order', { _order_id: order.id });
      if (gerr) {
        return new Response(JSON.stringify({ error: 'coin_credit_failed', detail: gerr.message }), { status: 500, headers: corsHeaders });
      }
      const row = Array.isArray(credited) ? credited[0] : credited;
      newBal = Number(row?.new_balance ?? 0);
    }
    const msg = [
      '✅ *Top-up Berhasil*',
      '━━━━━━━━━━━━━━',
      '',
      `🪙 +${order.coin_amount} koin masuk ke akun Anda.`,
      newBal != null ? `💰 Saldo sekarang: *${newBal}* koin` : null,
      '',
      '━━━━━━━━━━━━━━',
      '💖 Terima kasih — *ReplayTime*',
    ].filter((l) => l !== null).join('\n');
    const paused = await isFonntePaused(admin);
    const sent = paused ? { ok: false, data: { error: 'fonnte_timeout_pause' } } : await sendFonnte(order.user_phone, msg);
    if (sent.ok) await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
    await admin.from('wa_outbox').insert({
      phone: order.user_phone, message: msg, status: sent.ok ? 'sent' : 'failed',
      error: sent.ok ? null : JSON.stringify(sent.data),
      related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ ok: true, topup: true, sent: sent.ok }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const accessToken = await ensurePurchaseToken(admin, order);
  // (claim happens after we mark paid, just before the Fonnte send below)
  await admin.from('orders').update({
    status: 'paid', paid_at: new Date().toISOString(), access_token: accessToken,
  }).eq('id', order.id);

  // Build link + load template/origin
  const { data: settings } = await admin
    .from('site_settings').select('key,value').in('key', ['site_origin', 'wa_message_template', 'wa_show_template']);
  const sm = new Map((settings ?? []).map((s) => [s.key, s.value]));
  const origin = (sm.get('site_origin') || 'https://realtime48show.my.id').replace(/\/+$/, '');
  const tpl = sm.get('wa_message_template') ||
    '🎬 *ReplayTime*\n━━━━━━━━━━━━━━\n\n🎤 *{title}*\n{date_line}🔗 *Link Akses*\n{link}\n{password_line}{live_link_block}━━━━━━━━━━━━━━\n✨ Selamat menonton! 💖';
  const showTpl = sm.get('wa_show_template') ||
    '🔐 *TOKEN LIVE SATUAN*\n\n🎤 *{title}*\n\n📅 {date}\n\n🔗 *Link Live:*\n{live_link}\n\n🎬 *Link Replay:* {site}\n\n{password_line}👤 Hanya untuk *1 perangkat pertama*.\n\n— *ReplayTime* 💖';
  // SHOW purchase: link langsung ke /live (token diverifikasi unlock-live).
  // REPLAY purchase: tetap via /akses agar membuka replay player.
  const isReplayOnlyPurchase = !!order.replay_id && !order.show_id;
  const link = order.kind === 'bundle'
    ? `${origin}/shows?bt=${accessToken}`
    : order.show_id && !order.replay_id
      ? `${origin}/live?show=${order.show_id}&t=${accessToken}`
      : `${origin}/akses?token=${accessToken}${order.replay_id ? `&replay=${order.replay_id}` : ''}`;

  let password = '';
  let showDate = '';
  let groupLink = '';
  let replayInfo = '';
  if (order.show_id && !order.replay_id) {
    const { data: showRow } = await admin
      .from('active_shows').select('live_password,show_date,show_time,group_link,replay_info').eq('id', order.show_id).maybeSingle();
    password = String(showRow?.live_password || '').trim();
    groupLink = String((showRow as any)?.group_link || '').trim();
    replayInfo = String((showRow as any)?.replay_info || '').trim();
    if (showRow?.show_date) {
      const d = String(showRow.show_date);
      const t = String(showRow.show_time || '').slice(0, 5);
      showDate = t ? `${d} ${t}` : d;
    }
  }
  // Pembelian replay via kartu replay: link token sudah cukup, sandi tidak dikirim.
  if (isReplayOnlyPurchase) password = '';

  // Tanggal pesan untuk order replay mengikuti tanggal replay, bukan tanggal pembelian.
  let replayDate = '';
  if (order.replay_id) {
    const { data: repRow } = await admin
      .from('replays').select('date,show_time').eq('id', order.replay_id).maybeSingle();
    if ((repRow as any)?.date) {
      const rd = String((repRow as any).date);
      const rt = String((repRow as any).show_time || '').slice(0, 5);
      replayDate = rt ? `${rd} ${rt}` : rd;
    }
  }
  const dateStr = replayDate || new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const plainSite = (origin || 'https://realtime48show.my.id').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const fillTpl = (t: string, dateValue: string, linkValue: string, liveLinkValue: string) => t
    .replace(/\{date_line\}/g, dateValue ? `📅 ${dateValue}\n\n` : '')
    .replace(/\{password_line\}/g, password ? `🗝️ Sandi: *${password}*\n\n` : '')
    .replace(/\{live_link_block\}/g, liveLinkValue ? `📺 *Link Live*\n${liveLinkValue}\n\n` : '')
    .replace(/\{title\}/g, order.item_title || '')
    .replace(/\{link\}/g, linkValue)
    .replace(/\{live_link\}/g, liveLinkValue)
    .replace(/\{password\}/g, password)
    .replace(/\{date\}/g, dateValue)
    .replace(/\{order_id\}/g, orderId)
    .replace(/\{site\}/g, plainSite);

  let message: string;
  if (order.show_id && !order.replay_id) {
    // SHOW purchase: pakai template editable dari admin (wa_show_template).
    message = fillTpl(showTpl, showDate || dateStr, link, link);
    const extras: string[] = [];
    if (replayInfo) extras.push('', '🎞️ *Info Replay*', replayInfo);
    if (groupLink) extras.push('', '👥 *Link Grup*', groupLink);
    if (extras.length) message = message + '\n' + extras.join('\n');
  } else if (isReplayOnlyPurchase) {
    // REPLAY purchase: selalu kirim link token langsung.
    message = [
      '🎬 *RealTime48*',
      '━━━━━━━━━━━━━━',
      '',
      `🎤 *${order.item_title || ''}*`,
      `📅 ${dateStr}`,
      '',
      '🎞️ *Link Replay*',
      link,
      '',
      '━━━━━━━━━━━━━━',
      '✨ Selamat menonton! 💖',
    ].join('\n');
  } else {
    message = fillTpl(tpl, dateStr, link, '');
  }


  // Telegram: jalur alternatif — token tetap sampai walau Fonnte gangguan.
  const tgSent = await sendTelegramByPhone(admin, order.user_phone, message);

  // Pembeli murni Telegram (identitas semu `tg<chat_id>`) tidak punya nomor WA.
  const tgOnly = /^tg\d+$/.test(String(order.user_phone || ''));
  if (tgOnly) {
    if (tgSent) await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
    await admin.from('token_deliveries').insert({
      phone: order.user_phone, replay_id: order.replay_id, replay_title: order.item_title,
      order_id: order.id, access_token: accessToken, link,
      source: 'pakasir', requested_by: 'pakasir-webhook-telegram',
    });
    return new Response(JSON.stringify({ ok: true, telegram: tgSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const paused = await isFonntePaused(admin);
  const sent = paused ? { ok: false, data: { error: 'fonnte_timeout_pause' } } : await sendFonnte(order.user_phone, message);
  if (sent.ok || tgSent) await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
  await admin.from('token_deliveries').insert({
    phone: order.user_phone, replay_id: order.replay_id, replay_title: order.item_title,
    order_id: order.id, access_token: accessToken, link,
    source: 'pakasir', requested_by: 'pakasir-webhook',
  });
  await admin.from('wa_outbox').insert({
    phone: order.user_phone, message, status: sent.ok ? 'sent' : 'failed',
    error: sent.ok ? null : JSON.stringify(sent.data),
    related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
  });


  return new Response(JSON.stringify({ ok: true, sent: sent.ok }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
