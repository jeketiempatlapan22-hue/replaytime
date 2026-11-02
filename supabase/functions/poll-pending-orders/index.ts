import { primeReplayHost, rewriteReplay } from '../_shared/replay-origin.ts';
// Background poller: scans pending orders, queries Pakasir, marks paid + delivers WA.
// Triggered by pg_cron every minute. Idempotent — safe to re-run.
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
  return await verifyPakasirPaidStrict(apiKey, slug, pakasirOrderId, amount, 6000);
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
  // If we previously provisioned a token row for this order, reuse it.
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

  // Mint a brand-new token and insert the matching row (max_devices = 1).
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
  message = rewriteReplay(message);
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
    if (last.ok) { await markWaSent(dedupKey); return { ...last, attempts: i + 1 }; }
  }
  return { ...last, attempts: attempts.length };
}

async function hasSentWa(admin: ReturnType<typeof createClient>, orderId: string) {
  const { data } = await admin.from('wa_outbox')
    .select('id').eq('related_order_id', orderId).eq('status', 'sent').limit(1);
  return !!data?.length;
}

async function shouldDelayWaRetry(admin: ReturnType<typeof createClient>, orderId: string, windowMs = 15 * 60_000) {
  const { data } = await admin.from('wa_outbox')
    .select('status,created_at')
    .eq('related_order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.status === 'failed' && Date.now() - new Date(data.created_at).getTime() < windowMs;
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

const DEFAULT_WA_TPL =
  '🎬 *{title}*\n{date_line}\n🔗 Link Akses:\n{link}\n{password_line}{live_link_block}\n— *ReplayTime* 💖';

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl
    .replace(/\{date_line\}\n?/g, vars.date ? `📅 ${vars.date}\n` : '')
    .replace(/\{password_line\}\n?/g, vars.password ? `🔐 Sandi: *${vars.password}*\n` : '')
    .replace(/\{live_link_block\}\n?/g, vars.live_link ? `\n📺 Link Live:\n${vars.live_link}\n` : '')
    .replace(/\{(\w+)\}/g, (_, k) => (vars as Record<string, string>)[k] ?? '');
}

async function processOrder(admin: ReturnType<typeof createClient>, order: any, apiKey: string, slug: string, origin: string, tpl: string, showTpl: string) {
  if (!order.pakasir_order_id && order.status !== 'paid') return { id: order.id, skipped: 'no_pakasir_id' };

  if (order.status !== 'paid' && order.pakasir_order_id && Number(order.amount || 0) >= 100) {
    const verified = await verifyPakasirPaid(apiKey, slug, order.pakasir_order_id, Number(order.amount || 0));
    if (!verified.paid) {
      if (verified.status === 'canceled' || verified.status === 'cancelled' || verified.status === 'expired' || verified.status === 'failed') {
        await admin.from('orders').update({ status: verified.status }).eq('id', order.id);
      }
      return { id: order.id, status: verified.status || 'pending' };
    }
  } else if (order.status !== 'paid') {
    return { id: order.id, skipped: 'payment_not_verified' };
  }

  const alreadySent = order.token_sent_at && await hasSentWa(admin, order.id);
  if (order.token_sent_at && !alreadySent) {
    await admin.from('orders').update({ token_sent_at: null }).eq('id', order.id);
    order.token_sent_at = null;
  }

  // === COIN TOP-UP branch ===
  if (order.kind === 'coin_topup') {
    if (order.token_sent_at && alreadySent) return { id: order.id, status: 'already_sent' };
    let newBal: number | null = null;
    if (order.user_id && order.coin_amount > 0) {
      const { data: credited, error: gerr } = await admin.rpc('credit_coin_topup_order', { _order_id: order.id });
      if (gerr) {
        return { id: order.id, error: 'coin_credit_failed:' + gerr.message };
      }
      const row = Array.isArray(credited) ? credited[0] : credited;
      newBal = Number(row?.new_balance ?? 0);
    }
    const msg = `✅ *Top-up berhasil*\n+${order.coin_amount} koin sudah masuk.${newBal != null ? `\nSaldo sekarang: *${newBal}* koin` : ''}\n\nTerima kasih 💖 — *ReplayTime*`;
    if (await isFonntePaused(admin)) return { id: order.id, status: 'paid', topup: true, skipped: 'fonnte_timeout_pause' };
    if (await shouldDelayWaRetry(admin, order.id)) return { id: order.id, status: 'paid', topup: true, skipped: 'wa_retry_backoff' };
    const sent = await sendFonnte(order.user_phone, msg);
    if (sent.ok) await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
    await admin.from('wa_outbox').insert({
      phone: order.user_phone, message: msg, status: sent.ok ? 'sent' : 'failed',
      error: sent.ok ? null : JSON.stringify(sent.data),
      related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
    });
    return { id: order.id, status: 'paid', topup: true, sent: sent.ok };
  }

  const accessToken = await ensurePurchaseToken(admin, order);
  if (order.status !== 'paid' || order.access_token !== accessToken) {
    await admin.from('orders').update({
      status: 'paid', paid_at: new Date().toISOString(), access_token: accessToken,
    }).eq('id', order.id);
  }
  if (order.token_sent_at && alreadySent) return { id: order.id, status: 'already_sent' };

  const isShowPurchase = !!order.show_id && !order.replay_id;
  const isReplayOnlyPurchase = !!order.replay_id && !order.show_id;
  const link = order.kind === 'bundle'
    ? `${origin}/shows?bt=${accessToken}`
    : isShowPurchase
      ? `${origin}/live?show=${order.show_id}&t=${accessToken}`
      : `${origin}/akses?token=${accessToken}${order.replay_id ? `&replay=${order.replay_id}` : ''}`;

  let password = '';
  let liveLink = '';
  let showDate = '';
  let groupLink = '';
  let replayInfo = '';
  if (isShowPurchase) {
    const { data: showRow } = await admin
      .from('active_shows')
      .select('live_password,show_date,show_time,group_link,replay_info')
      .eq('id', order.show_id).maybeSingle();
    password = String((showRow as any)?.live_password || '').trim();
    groupLink = String((showRow as any)?.group_link || '').trim();
    replayInfo = String((showRow as any)?.replay_info || '').trim();
    if ((showRow as any)?.show_date) {
      const d = String((showRow as any).show_date);
      const t = String((showRow as any).show_time || '').slice(0, 5);
      showDate = t ? `${d} ${t}` : d;
    }
    liveLink = link;
  }
  if (isReplayOnlyPurchase) {
    const { data: rep } = await admin
      .from('replays').select('password').eq('id', order.replay_id).maybeSingle();
    // Pembelian replay: link token sudah cukup, jangan kirim sandi.
    password = '';
    void rep;
  }

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
  const plainSite = origin.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  const fillTpl = (t: string, dateValue: string, linkValue: string, liveLinkValue: string) => t
    .replace(/\{date_line\}/g, dateValue ? `📅 ${dateValue}\n\n` : '')
    .replace(/\{password_line\}/g, password ? `🗝️ Sandi: *${password}*\n\n` : '')
    .replace(/\{live_link_block\}/g, liveLinkValue ? `📺 *Link Live*\n${liveLinkValue}\n\n` : '')
    .replace(/\{title\}/g, order.item_title || '')
    .replace(/\{link\}/g, linkValue)
    .replace(/\{live_link\}/g, liveLinkValue)
    .replace(/\{password\}/g, password)
    .replace(/\{date\}/g, dateValue)
    .replace(/\{order_id\}/g, order.pakasir_order_id || '')
    .replace(/\{site\}/g, plainSite);

  let message: string;
  if (isShowPurchase) {
    message = fillTpl(showTpl, showDate || dateStr, link, link);
    const extras: string[] = [];
    if (replayInfo) extras.push('', '🎞️ *Info Replay*', replayInfo);
    if (groupLink) extras.push('', '👥 *Link Grup*', groupLink);
    if (extras.length) message = message + '\n' + extras.join('\n');
  } else if (isReplayOnlyPurchase) {
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
    message = fillTpl(tpl, dateStr, link, liveLink);
  }


  // Telegram: jalur alternatif pengiriman token (kebal terhadap gangguan Fonnte).
  const tgSent = await sendTelegramByPhone(admin, order.user_phone, message);

  // Pembeli murni Telegram: tidak ada nomor WA, jadi lewati Fonnte.
  if (/^tg\d+$/.test(String(order.user_phone || ''))) {
    if (tgSent) await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
    await admin.from('token_deliveries').insert({
      phone: order.user_phone, replay_id: order.replay_id, replay_title: order.item_title,
      order_id: order.id, access_token: accessToken, link,
      source: 'pakasir-poll', requested_by: 'poll-pending-orders-telegram',
    });
    return { id: order.id, status: 'paid', telegram: tgSent };
  }



  if (await isFonntePaused(admin)) {
    if (tgSent) await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
    return { id: order.id, status: 'paid', skipped: 'fonnte_timeout_pause', telegram: tgSent };
  }
  if (await shouldDelayWaRetry(admin, order.id)) return { id: order.id, status: 'paid', skipped: 'wa_retry_backoff', telegram: tgSent };
  const sent = await sendFonnte(order.user_phone, message);
  if (sent.ok || tgSent) await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
  await admin.from('token_deliveries').insert({
    phone: order.user_phone, replay_id: order.replay_id, replay_title: order.item_title,
    order_id: order.id, access_token: accessToken, link,
    source: 'pakasir-poll', requested_by: 'poll-pending-orders',
  });
  await admin.from('wa_outbox').insert({
    phone: order.user_phone, message, status: sent.ok ? 'sent' : 'failed',
    error: sent.ok ? null : JSON.stringify(sent.data),
    related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
  });
  return { id: order.id, status: 'paid', sent: sent.ok };
}

Deno.serve(async (req) => {
  await primeReplayHost();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth: invoked by pg_cron (anon-key bearer) or service-role/admin tooling.
  // Reject anonymous traffic that doesn't carry one of the project keys.
  const authHeader = req.headers.get('Authorization') || '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const PUBLISHABLE = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
  const PUBLISHABLES = (Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const accepted = [SERVICE_ROLE, ANON, PUBLISHABLE, ...PUBLISHABLES].filter(Boolean);
  let allowed = !!bearer && accepted.includes(bearer);
  if (!allowed && bearer.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(bearer.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      allowed = payload?.role === 'anon' || payload?.role === 'service_role';
    } catch { allowed = false; }
  }
  if (!allowed && bearer) {
    try {
      const userClient = createClient(Deno.env.get('SUPABASE_URL')!, ANON, { global: { headers: { Authorization: authHeader } } });
      const { data: ud } = await userClient.auth.getUser();
      const adminCheck = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_ROLE);
      const { data: isAdmin } = await adminCheck.rpc('has_role', { _user_id: ud?.user?.id, _role: 'admin' });
      allowed = !!isAdmin;
    } catch { allowed = false; }
  }
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const apiKey = Deno.env.get('PAKASIR_API_KEY');
  const slug = Deno.env.get('PAKASIR_PROJECT_SLUG');
  if (!apiKey || !slug) {
    return new Response(JSON.stringify({ error: 'pakasir not configured' }), { status: 503, headers: corsHeaders });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: settings } = await admin
    .from('site_settings').select('key,value').in('key', ['site_origin', 'wa_message_template', 'wa_show_template']);
  const sm = new Map((settings ?? []).map((s) => [s.key, s.value]));
  const origin = (sm.get('site_origin') || 'https://realtime48show.my.id').replace(/\/+$/, '');
  const tpl = sm.get('wa_message_template') || DEFAULT_WA_TPL;
  const showTpl = sm.get('wa_show_template') ||
    '🔐 *TOKEN LIVE SATUAN*\n\n🎤 *{title}*\n\n📅 {date}\n\n🔗 *Link Live:*\n{live_link}\n\n🎬 *Link Replay:* {site}\n\n{password_line}👤 Hanya untuk *1 perangkat pertama*.\n\n— *ReplayTime* 💖';

  // Prioritize confirmed-paid orders that still need WA, then fresh pending QRIS.
  // This avoids long scans of old unpaid orders that were causing function timeouts.
  const pendingSince = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
  const unsentSince = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const [{ data: paidUnsent, error: paidErr }, { data: pendingOrders, error: pendingErr }] = await Promise.all([
    admin.from('orders').select('*').eq('status', 'paid').is('token_sent_at', null).gte('created_at', unsentSince).order('paid_at', { ascending: false }).limit(100),
    admin.from('orders').select('*').eq('status', 'pending').gte('created_at', pendingSince).order('created_at', { ascending: false }).limit(40),
  ]);
  const error = paidErr || pendingErr;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  const seen = new Set<string>();
  // Konfirmasi pembayaran (pending → paid, kredit koin, token) DIDAHULUKAN, lalu baru
  // pengiriman ulang WA. Dulu 100 order "paid-unsent" diproses lebih dulu dan menghabiskan
  // batas waktu, sehingga pembayaran baru (mis. top-up koin) tidak pernah dicek.
  const orders = [...(pendingOrders ?? []), ...(paidUnsent ?? [])].filter((o) => !seen.has(o.id) && seen.add(o.id));
  console.log(`[poll] scanning ${orders.length} orders (${pendingOrders?.length ?? 0} pending first, ${paidUnsent?.length ?? 0} paid-unsent)`);

  const results: any[] = [];
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 30_000;
  const CONCURRENCY = 6;
  for (let i = 0; i < orders.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      results.push({ skipped: 'time_budget_reached', remaining: orders.length - i });
      break;
    }
    const batch = orders.slice(i, i + CONCURRENCY);
    const out = await Promise.all(batch.map(async (o) => {
      try {
        if (o.status === 'paid' && o.token_sent_at && await hasSentWa(admin, o.id)) return { id: o.id, skipped: 'already_delivered' };
        return await processOrder(admin, o, apiKey, slug, origin, tpl, showTpl);
      } catch (e) {
        return { id: o.id, error: String(e) };
      }
    }));
    results.push(...out);
  }

  // === MEMBERSHIP ORDERS (reserved QRIS yang webhook-nya tidak sampai) ===
  // Bila sudah terbayar di Pakasir → finalize + kirim WA. Idempotent.
  //
  // Auto-retry dengan batas terukur:
  // - Maks 5 percobaan pengiriman WA per order.
  // - Backoff bertingkat (menit sejak last attempt): 1, 5, 15, 60, 360.
  // - Dedup: jika order sudah punya token & wa_sent_at, skip.
  const MAX_WA_ATTEMPTS = 5;
  const BACKOFF_MIN = [0, 1, 5, 15, 60, 360]; // index = attempts done
  const memResults: any[] = [];
  if (Date.now() - startedAt > 35_000) {
    memResults.push({ skipped: 'time_budget_reached' });
  } else try {
    const memTpl = (await admin.from('site_settings').select('value').eq('key', 'wa_membership_template').maybeSingle())
      .data?.value ||
      '👑 *MEMBERSHIP AKTIF*\n\n📦 *{package_name}*\n📅 Berlaku hingga: {expires_at}\n\n🔗 *Link Akses:*\n{link}\n\n🎬 *Link Replay:* realtime48show.my.id\n\n{replay_info_block}👤 Berlaku untuk *{max_devices} perangkat*.\n\n— *ReplayTime* 💖';
    const { data: mOrders } = await admin
      .from('membership_orders').select('*')
      .in('status', ['reserved', 'paid', 'expired'])
      .eq('kind', 'qris')
      .not('pakasir_order_id', 'is', null)
      .gte('created_at', pendingSince)
      .order('created_at', { ascending: false }).limit(120);
    for (const mo of mOrders ?? []) {
      if (Date.now() - startedAt > 50_000) { memResults.push({ skipped: 'time_budget_reached' }); break; }
      try {
        // Skip jika sudah punya token & WA sudah pernah sukses (idempotent guard).
        if (mo.membership_token_id && mo.wa_sent_at) {
          memResults.push({ id: mo.id, skipped: 'already_delivered' }); continue;
        }
        // Skip jika melewati batas percobaan.
        const attempts = Number(mo.wa_attempts || 0);
        if (attempts >= MAX_WA_ATTEMPTS && mo.membership_token_id) {
          memResults.push({ id: mo.id, skipped: 'max_attempts' }); continue;
        }
        // Hormati backoff window.
        if (mo.wa_last_attempt_at) {
          const waitMin = BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length - 1)];
          const nextOk = new Date(mo.wa_last_attempt_at).getTime() + waitMin * 60_000;
          if (Date.now() < nextOk) {
            memResults.push({ id: mo.id, skipped: 'backoff' }); continue;
          }
        }

        const verified = await verifyPakasirPaid(apiKey, slug, mo.pakasir_order_id, Number(mo.amount || 0));
        if (!verified.paid) { memResults.push({ id: mo.id, status: verified.status || 'pending' }); continue; }

        let tok: any = null;
        if (!mo.membership_token_id) {
          const { data: fin, error: ferr } = await admin.rpc('finalize_membership_order', { _order_id: mo.id });
          if (ferr) {
            await admin.from('membership_orders').update({
              wa_attempts: attempts + 1,
              wa_last_attempt_at: new Date().toISOString(),
              wa_last_error: 'finalize_failed:' + ferr.message,
            }).eq('id', mo.id);
            memResults.push({ id: mo.id, error: ferr.message }); continue;
          }
          tok = Array.isArray(fin) ? fin[0] : fin;
        } else {
          const { data: t } = await admin.from('membership_tokens')
            .select('token,password,expires_at,max_devices,includes_replays,duration_days,package_id')
            .eq('id', mo.membership_token_id).maybeSingle();
          const { data: pkg } = await admin.from('membership_packages')
            .select('name,replay_info,duration_days').eq('id', mo.package_id).maybeSingle();
          if (!t || !pkg) { memResults.push({ id: mo.id, error: 'token_or_pkg_missing' }); continue; }
          tok = {
            token: t.token, password: t.password, expires_at: t.expires_at,
            max_devices: t.max_devices, includes_replays: t.includes_replays,
            duration_days: t.duration_days || pkg.duration_days,
            replay_info: pkg.replay_info || '', package_name: pkg.name,
          };
        }

        const link = `${origin}/live?mtoken=${encodeURIComponent(tok.token)}&mp=${encodeURIComponent(tok.password)}`;
        const expiresStr = new Date(tok.expires_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        const msg = memTpl
          .replace(/\{package_name\}/g, tok.package_name || '')
          .replace(/\{link\}/g, link)
          .replace(/\{password\}/g, tok.password || '')
          .replace(/\{expires_at\}/g, expiresStr)
          .replace(/\{duration_days\}/g, String(tok.duration_days || ''))
          .replace(/\{max_devices\}/g, String(tok.max_devices || 1))
          .replace(/\{replay_info\}/g, tok.replay_info || '')
          .replace(/\{replay_info_block\}/g, tok.replay_info ? `🎬 *Info Replay:*\n${tok.replay_info}\n\n` : '')
          .replace(/\{site\}/g, origin.replace(/^https?:\/\//, ''));
        if (await isFonntePaused(admin)) {
          memResults.push({ id: mo.id, finalized: !mo.membership_token_id, skipped: 'fonnte_timeout_pause' }); continue;
        }
        if (await shouldDelayWaRetry(admin, mo.id)) {
          memResults.push({ id: mo.id, finalized: !mo.membership_token_id, skipped: 'wa_retry_backoff' }); continue;
        }
        const sent = await sendFonnte(mo.phone, msg);
        const nowIso = new Date().toISOString();
        await admin.from('membership_orders').update({
          wa_attempts: attempts + 1,
          wa_last_attempt_at: nowIso,
          wa_last_error: sent.ok ? null : JSON.stringify(sent.data).slice(0, 500),
          wa_sent_at: sent.ok ? nowIso : mo.wa_sent_at,
        }).eq('id', mo.id);
        await admin.from('wa_outbox').insert({
          phone: mo.phone, message: msg, status: sent.ok ? 'sent' : 'failed',
          error: sent.ok ? null : JSON.stringify(sent.data),
          related_order_id: mo.id, fonnte_response: sent.data as Record<string, unknown>,
        });
        if (sent.ok) {
          await admin.from('token_deliveries').insert({
            phone: mo.phone, replay_id: null, replay_title: `Membership • ${tok.package_name}`,
            order_id: null, access_token: tok.token, link,
            source: 'pakasir-poll', requested_by: 'poll-pending-orders-membership',
          });
        }
        memResults.push({ id: mo.id, finalized: !mo.membership_token_id, sent: sent.ok, attempts: attempts + 1 });
      } catch (e) {
        memResults.push({ id: mo.id, error: String(e) });
      }
    }
  } catch (e) {
    console.error('[poll] membership scan error', e);
  }


  return new Response(JSON.stringify({ ok: true, scanned: results.length, membership: memResults.length, results, membership_results: memResults }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
