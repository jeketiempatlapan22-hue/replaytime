import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { primeReplayHost, rewriteReplay } from './replay-origin.ts';
// Polls DOKU for a given order's payment status. If paid, marks the order
// as paid, generates an access token, and sends the WhatsApp notification
// (same format as the pakasir-webhook). Idempotent via `token_sent_at`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { waDedupKey, claimWaSend, markWaSent } from './wa-guard.ts';
import { sendTelegramByPhone } from './telegram.ts';
import { verifyDokuPaidStrict, PAID_STATUSES as STRICT_PAID_STATUSES } from './doku.ts';
import { issueBundleToken } from './bundle.ts';



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

async function verifyDokuPaid(apiKey: string, slug: string, pakasirOrderId: string, amount: number) {
  return await verifyDokuPaidStrict(apiKey, slug, pakasirOrderId, amount, 15000);
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
      label: `doku:${order.user_phone || ''}`.slice(0, 120),
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
      label: `doku:${order.user_phone || ''}`.slice(0, 120),
      kind: 'personal', max_devices: 1, revoked: false,
    });
  } else if (order.replay_id) {
    await admin.from('replay_personal_tokens').insert({
      replay_id: order.replay_id, token: newTok,
      label: `doku:${order.user_phone || ''}`.slice(0, 120),
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
    if (last.ok) { await markWaSent(dedupKey); return last; }
  }
  return last;
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

async function memCreds(admin: any, orderId: string) {
  try {
    const { data: o } = await admin.from('membership_orders').select('membership_token_id').eq('id', orderId).maybeSingle();
    if (!o?.membership_token_id) return {};
    const { data: t } = await admin.from('membership_tokens').select('token,password,expires_at').eq('id', o.membership_token_id).maybeSingle();
    if (!t) return {};
    return { token: t.token, password: t.password, expires_at: t.expires_at, link: `/live?mtoken=${encodeURIComponent(t.token)}&mp=${encodeURIComponent(t.password)}` };
  } catch { return {}; }
}

Deno.serve(async (req) => {
  await primeReplayHost();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const orderUuid = String(body.order_id ?? '');
    if (!orderUuid) {
      return new Response(JSON.stringify({ error: 'missing order_id' }), { status: 400, headers: corsHeaders });
    }

    const apiKey = 'server-managed';
    const slug = 'doku';
    if (!apiKey || !slug) {
      return new Response(JSON.stringify({ error: 'DOKU belum diaktifkan. Hubungi admin.' }), { status: 503, headers: corsHeaders });
    }

    const admin = createClient((Deno.env.get('SUPABASE_URL') || ''), (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''));

    // ===== MEMBERSHIP ORDER branch =====
    // Frontend polls with membership_orders.id; resolve there first.
    const { data: mOrder } = await admin
      .from('membership_orders').select('*').eq('id', orderUuid).maybeSingle();
    if (mOrder) {
      // Already finalized + WA sent → return as-is
      if (mOrder.status === 'paid' && mOrder.membership_token_id && mOrder.wa_sent_at) {
        return new Response(JSON.stringify({ ok: true, status: 'paid', already: true, membership: true, ...(await memCreds(admin, mOrder.id)) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      let paid = mOrder.status === 'paid';
      if (!paid) {
        if (!mOrder.pakasir_order_id) {
          return new Response(JSON.stringify({ ok: true, status: 'pending', membership: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const verified = await verifyDokuPaid(apiKey, slug, mOrder.pakasir_order_id, Number(mOrder.amount || 0));
        paid = verified.paid;
        if (!paid) {
          return new Response(JSON.stringify({ ok: true, status: verified.status || 'pending', membership: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Finalize (issue token) if not yet
      let tok: any = null;
      if (!mOrder.membership_token_id) {
        const { data: fin, error: ferr } = await admin.rpc('finalize_membership_order', { _order_id: mOrder.id });
        if (ferr) {
          await admin.from('membership_orders').update({
            wa_attempts: (Number(mOrder.wa_attempts) || 0) + 1,
            wa_last_attempt_at: new Date().toISOString(),
            wa_last_error: 'finalize_failed:' + ferr.message,
          }).eq('id', mOrder.id);
          return new Response(JSON.stringify({ error: 'finalize_failed', detail: ferr.message }), { status: 500, headers: corsHeaders });
        }
        tok = Array.isArray(fin) ? fin[0] : fin;
      } else {
        const { data: t } = await admin.from('membership_tokens')
          .select('token,password,expires_at,max_devices,includes_replays,duration_days,package_id')
          .eq('id', mOrder.membership_token_id).maybeSingle();
        const { data: pkg } = await admin.from('membership_packages')
          .select('name,replay_info,duration_days').eq('id', mOrder.package_id).maybeSingle();
        if (!t || !pkg) return new Response(JSON.stringify({ error: 'token_or_pkg_missing' }), { status: 500, headers: corsHeaders });
        tok = {
          token: t.token, password: t.password, expires_at: t.expires_at,
          max_devices: t.max_devices, includes_replays: t.includes_replays,
          duration_days: t.duration_days || pkg.duration_days,
          replay_info: pkg.replay_info || '', package_name: pkg.name,
        };
      }

      // Atomic claim WA delivery
      const claimAt = new Date().toISOString();
      const { data: claimed } = await admin.from('membership_orders')
        .update({ wa_last_attempt_at: claimAt })
        .eq('id', mOrder.id).is('wa_sent_at', null).select('id');
      if (!claimed || claimed.length === 0) {
        return new Response(JSON.stringify({ ok: true, status: 'paid', membership: true, ...(await memCreds(admin, mOrder.id)), already_sent: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: msettings } = await admin
        .from('site_settings').select('key,value').in('key', ['site_origin','wa_membership_template']);
      const msm = new Map((msettings ?? []).map((s) => [s.key, s.value]));
      const morigin = (msm.get('site_origin') || 'https://realtime48show.my.id').replace(/\/+$/, '');
      const mtpl = msm.get('wa_membership_template') ||
        '👑 *MEMBERSHIP AKTIF*\n\n📦 *{package_name}*\n📅 Berlaku hingga: {expires_at}\n\n🔗 *Link Akses:*\n{link}\n\n🎬 *Link Replay:* realtime48show.my.id\n\n{replay_info_block}👤 Berlaku untuk *{max_devices} perangkat*.\n\n— *ReplayTime* 💖';
      const mlink = `${morigin}/live?mtoken=${encodeURIComponent(tok.token)}&mp=${encodeURIComponent(tok.password)}`;
      const expiresStr = new Date(tok.expires_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      const mmsg = mtpl
        .replace(/\{package_name\}/g, tok.package_name || '')
        .replace(/\{link\}/g, mlink)
        .replace(/\{password\}/g, tok.password || '')
        .replace(/\{expires_at\}/g, expiresStr)
        .replace(/\{duration_days\}/g, String(tok.duration_days || ''))
        .replace(/\{max_devices\}/g, String(tok.max_devices || 1))
        .replace(/\{replay_info\}/g, tok.replay_info || '')
        .replace(/\{replay_info_block\}/g, tok.replay_info ? `🎬 *Info Replay:*\n${tok.replay_info}\n\n` : '')
        .replace(/\{site\}/g, morigin.replace(/^https?:\/\//, ''));

      // Telegram: jalur alternatif (kebal gangguan Fonnte).
      await sendTelegramByPhone(admin, mOrder.phone, mmsg);
      if (await isFonntePaused(admin)) {
        return new Response(JSON.stringify({ ok: true, status: 'paid', membership: true, ...(await memCreds(admin, mOrder.id)), sent: false, retry_delayed: true, reason: 'fonnte_timeout_pause' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (await shouldDelayWaRetry(admin, mOrder.id)) {
        return new Response(JSON.stringify({ ok: true, status: 'paid', membership: true, ...(await memCreds(admin, mOrder.id)), sent: false, retry_delayed: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const sentM = await sendFonnte(mOrder.phone, mmsg);
      const nowIso = new Date().toISOString();
      await admin.from('membership_orders').update({
        wa_attempts: (Number(mOrder.wa_attempts) || 0) + 1,
        wa_last_attempt_at: nowIso,
        wa_last_error: sentM.ok ? null : JSON.stringify(sentM.data).slice(0, 500),
        wa_sent_at: sentM.ok ? nowIso : null,
      }).eq('id', mOrder.id);
      await admin.from('wa_outbox').insert({
        phone: mOrder.phone, message: mmsg, status: sentM.ok ? 'sent' : 'failed',
        error: sentM.ok ? null : JSON.stringify(sentM.data),
        related_order_id: mOrder.id, fonnte_response: sentM.data as Record<string, unknown>,
      });
      if (sentM.ok) {
        await admin.from('token_deliveries').insert({
          phone: mOrder.phone, replay_id: null, replay_title: `Membership • ${tok.package_name}`,
          order_id: null, access_token: tok.token, link: mlink,
          source: 'doku', requested_by: 'check-pakasir-status-membership',
        });
      }
      return new Response(JSON.stringify({ ok: true, status: 'paid', membership: true, ...(await memCreds(admin, mOrder.id)), sent: sentM.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: order } = await admin
      .from('orders').select('*').eq('id', orderUuid).maybeSingle();
    if (!order) return new Response(JSON.stringify({ error: 'order not found' }), { status: 404, headers: corsHeaders });

    // Pembeli Telegram murni tidak melewati Fonnte, jadi `token_sent_at` saja
    // sudah menandakan token terkirim (jangan cek wa_outbox).
    const isTgOnlyOrder = /^tg\d+$/i.test(String(order.user_phone || ''));
    const alreadySent = order.token_sent_at && (isTgOnlyOrder || await hasSentWa(admin, order.id));


    // Kalau order sudah ditandai paid oleh admin (approve manual bukti transaksi),
    // lewati verifikasi DOKU agar finalize + kirim WA tetap jalan.
    if (order.status !== 'paid') {
      const verified = await verifyDokuPaid(apiKey, slug, order.pakasir_order_id || '', Number(order.amount || 0));
      if (!verified.paid) {
        return new Response(JSON.stringify({ ok: true, status: verified.status || 'pending' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (order.status === 'paid' && alreadySent) {
      return new Response(JSON.stringify({ ok: true, status: 'paid', already: true, access_token: order.access_token }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
        if (gerr) throw new Error('coin_credit_failed:' + gerr.message);
        const row = Array.isArray(credited) ? credited[0] : credited;
        newBal = Number(row?.new_balance ?? 0);
      }
      if (!alreadySent) {
        const msg = `✅ *Top-up berhasil*\n+${order.coin_amount} koin sudah masuk.${newBal != null ? `\nSaldo sekarang: *${newBal}* koin` : ''}\n\nTerima kasih 💖 — *ReplayTime*`;
        const tgOk = await sendTelegramByPhone(admin, order.user_phone, msg);
        if (isTgOnlyOrder) {
          if (tgOk) await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
          return new Response(JSON.stringify({ ok: true, status: 'paid', topup: true, new_balance: newBal, telegram: tgOk }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if (await isFonntePaused(admin)) {
          return new Response(JSON.stringify({ ok: true, status: 'paid', topup: true, new_balance: newBal, sent: false, retry_delayed: true, reason: 'fonnte_timeout_pause' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if (await shouldDelayWaRetry(admin, order.id)) {
          return new Response(JSON.stringify({ ok: true, status: 'paid', topup: true, new_balance: newBal, sent: false, retry_delayed: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const sent = await sendFonnte(order.user_phone, msg);
        if (sent.ok || tgOk) {
          await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
        }
        await admin.from('wa_outbox').insert({
          phone: order.user_phone, message: msg, status: sent.ok ? 'sent' : 'failed',
          error: sent.ok ? null : JSON.stringify(sent.data),
          related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
        });
      }
      return new Response(JSON.stringify({ ok: true, status: 'paid', topup: true, new_balance: newBal }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Mark paid + provision a fresh single-device token row
    const accessToken = await ensurePurchaseToken(admin, order);
    if (order.status !== 'paid' || order.access_token !== accessToken) {
      await admin.from('orders').update({
        status: 'paid', paid_at: new Date().toISOString(), access_token: accessToken,
      }).eq('id', order.id);
    }

    if (order.token_sent_at && (isTgOnlyOrder || await hasSentWa(admin, order.id))) {

      return new Response(JSON.stringify({ ok: true, status: 'paid', access_token: accessToken }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build link + message via admin-editable template (selaras dgn pakasir-webhook)
    const { data: settings } = await admin
      .from('site_settings').select('key,value').in('key', ['site_origin', 'wa_message_template', 'wa_show_template']);
    const sm = new Map((settings ?? []).map((s) => [s.key, s.value]));
    const origin = (sm.get('site_origin') || 'https://realtime48show.my.id').replace(/\/+$/, '');
    const tpl = sm.get('wa_message_template') ||
      '🎬 *{title}*\n{date_line}\n🔗 Link Akses:\n{link}\n{password_line}{live_link_block}\n— *ReplayTime* 💖';
    const showTpl = sm.get('wa_show_template') ||
      '🔐 *TOKEN LIVE SATUAN*\n\n🎤 *{title}*\n\n📅 {date}\n\n🔗 *Link Live:*\n{live_link}\n\n🎬 *Link Replay:* {site}\n\n{password_line}👤 Hanya untuk *1 perangkat pertama*.\n\n— *ReplayTime* 💖';

    const isShowPurchase = !!order.show_id && !order.replay_id;
    const link = order.kind === 'bundle'
      ? `${origin}/shows?bt=${accessToken}`
      : isShowPurchase
        ? `${origin}/live?show=${order.show_id}&t=${accessToken}`
        : `${origin}/akses?token=${accessToken}${order.replay_id ? `&replay=${order.replay_id}` : ''}`;

    let password = '';
    let showDate = '';
    let groupLink = '';
    let replayInfo = '';
    if (order.show_id) {
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
    if (!password && order.replay_id && !order.show_id) {
      const { data: rep } = await admin
        .from('replays').select('password').eq('id', order.replay_id).maybeSingle();
      password = String(rep?.password || '').trim();
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
    } else {
      message = fillTpl(tpl, dateStr, link, '');
    }

    // Telegram: kirim token juga ke Telegram user bila sudah terhubung.
    const tgSent = await sendTelegramByPhone(admin, order.user_phone, message);

    // Pembeli murni Telegram (identitas semu `tg<chat_id>`) tidak punya nomor WA:
    // jangan panggil Fonnte (selalu gagal & memicu mode pause).
    const tgOnly = /^tg\d+$/i.test(String(order.user_phone || ''));
    if (tgOnly) {
      if (tgSent) {
        await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);
      }
      await admin.from('token_deliveries').insert({
        phone: order.user_phone, replay_id: order.replay_id, replay_title: order.item_title,
        order_id: order.id, access_token: accessToken, link,
        source: 'doku', requested_by: 'check-pakasir-status-telegram',
      });
      return new Response(JSON.stringify({ ok: true, status: 'paid', access_token: accessToken, telegram: tgSent, sent: tgSent }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (await isFonntePaused(admin)) {
      return new Response(JSON.stringify({ ok: true, status: 'paid', access_token: accessToken, sent: false, retry_delayed: true, reason: 'fonnte_timeout_pause' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (await shouldDelayWaRetry(admin, order.id)) {
      return new Response(JSON.stringify({ ok: true, status: 'paid', access_token: accessToken, sent: false, retry_delayed: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const sent = await sendFonnte(order.user_phone, message);
    if (sent.ok || tgSent) await admin.from('orders').update({ token_sent_at: new Date().toISOString() }).eq('id', order.id);

    await admin.from('token_deliveries').insert({
      phone: order.user_phone, replay_id: order.replay_id, replay_title: order.item_title,
      order_id: order.id, access_token: accessToken, link,
      source: 'doku', requested_by: 'check-pakasir-status',
    });
    await admin.from('wa_outbox').insert({
      phone: order.user_phone, message, status: sent.ok ? 'sent' : 'failed',
      error: sent.ok ? null : JSON.stringify(sent.data),
      related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
    });

    return new Response(JSON.stringify({ ok: true, status: 'paid', access_token: accessToken, sent: sent.ok }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
