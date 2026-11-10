import { waGuard } from '../_shared/wa-check.ts';
import { pakasirCreateQrisCompat } from '../_shared/pakasir.ts';
// Create a Pakasir dynamic QRIS order for an active show purchase.
// Each call creates a NEW order_id; webhook will deliver token via WhatsApp.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getBundle } from '../_shared/bundle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('62')) return d;
  if (d.startsWith('8')) return '62' + d;
  return d;
}

function validPhone(p: string) {
  // Fonnte rejects over-long targets. Indonesian mobile WA numbers should be
  // 628 + 8–11 digits (total 11–14 digits), not arbitrary 62-prefixed input.
  return /^628\d{8,11}$/.test(p);
}

function genOrderId() {
  return `rt${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const showId = String(body.show_id ?? '');
    const replayId = String(body.replay_id ?? '');
    const kind = String(body.kind ?? 'show'); // 'show' | 'replay' | 'replay_only'
    const tgChatId = Number(body.telegram_chat_id ?? 0);
    // Pembeli lewat Telegram tidak perlu nomor WhatsApp: kami pakai identitas
    // semu `tg<chat_id>` yang dipetakan ke chat Telegram untuk pengiriman token.
    const phone = tgChatId ? `tg${tgChatId}` : normalizePhone(String(body.phone ?? ''));

    if (!tgChatId && !validPhone(phone)) return new Response(JSON.stringify({ error: 'invalid phone' }), { status: 400, headers: corsHeaders });
    { const wa = await waGuard(phone); if (wa) return new Response(JSON.stringify({ error: wa }), { status: 400, headers: corsHeaders }); }

    if (!['show', 'replay', 'replay_only', 'bundle'].includes(kind)) {
      return new Response(JSON.stringify({ error: 'invalid kind' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Petakan identitas semu Telegram -> chat_id agar pengiriman token otomatis
    // (webhook Pakasir / poller / cek status) menemukan tujuannya.
    if (tgChatId) {
      await admin.from('telegram_links').upsert(
        { phone, chat_id: tgChatId, link_code: `TG${tgChatId}`, linked_at: new Date().toISOString() },
        { onConflict: 'phone' },
      );
    }

    const slug = Deno.env.get('PAKASIR_PROJECT_SLUG');
    if (!slug) return new Response(JSON.stringify({ error: 'pakasir not configured' }), { status: 500, headers: corsHeaders });


    // Rate limit: max 5 pending orders per phone in last 10 minutes
    try {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count } = await admin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('user_phone', phone)
        .eq('status', 'pending')
        .gte('created_at', since);
      if ((count || 0) >= 5) {
        return new Response(JSON.stringify({ error: 'rate_limited', message: 'Too many pending orders. Try again in a few minutes.' }), { status: 429, headers: corsHeaders });
      }
    } catch (_) { /* ignore rate-limit check errors */ }


    let amount = 0;
    let itemTitle = '';
    let resolvedShowId: string | null = null;
    let resolvedReplayId: string | null = null;

    if (kind === 'bundle') {
      const bundle = await getBundle(admin);
      if (!bundle || !bundle.is_active) {
        return new Response(JSON.stringify({ error: 'bundle_unavailable' }), { status: 400, headers: corsHeaders });
      }
      if (!bundle.show_ids.length) {
        return new Response(JSON.stringify({ error: 'bundle_empty' }), { status: 400, headers: corsHeaders });
      }
      amount = Number(bundle.price_idr || 0);
      itemTitle = `Bundel • ${bundle.name} (${bundle.show_ids.length} show)`;
    } else if (kind === 'replay_only') {
      // Standalone replay purchase — default Rp 2.000 if not provided.
      if (!replayId) return new Response(JSON.stringify({ error: 'missing replay_id' }), { status: 400, headers: corsHeaders });
      const { data: replay, error: rerr } = await admin
        .from('replays').select('id, title').eq('id', replayId).maybeSingle();
      if (rerr || !replay) return new Response(JSON.stringify({ error: 'replay not found' }), { status: 404, headers: corsHeaders });
      amount = Math.max(2000, Number(body.amount || 0) || 2000);
      itemTitle = `Replay • ${replay.title}`;
      resolvedReplayId = replay.id;
    } else {
      if (!showId) return new Response(JSON.stringify({ error: 'missing show_id' }), { status: 400, headers: corsHeaders });
      const { data: show, error: showErr } = await admin
        .from('active_shows').select('*').eq('id', showId).maybeSingle();
      if (showErr || !show) return new Response(JSON.stringify({ error: 'show not found' }), { status: 404, headers: corsHeaders });
      if (kind === 'replay') {
        const a = Number(show.price_replay || show.pakasir_amount || 0);
        amount = a >= 100 ? a : 2000; // default Rp 2.000 for replay if admin not set
      } else {
        const a = Number(show.price_show || show.pakasir_amount || 0);
        amount = a >= 100 ? a : 0;
      }
      itemTitle = `${kind === 'replay' ? 'Replay' : 'Show'} • ${show.title}`;
      resolvedShowId = show.id;
      resolvedReplayId = kind === 'replay' ? show.replay_id : null;
    }

    if (!amount || amount < 100) return new Response(JSON.stringify({ error: 'invalid amount' }), { status: 400, headers: corsHeaders });

    const orderId = genOrderId();
    const qrUrl = `https://app.pakasir.com/pay/${slug}/${orderId}?amount=${amount}&qris_only=1`;
    const apiKey = Deno.env.get('PAKASIR_API_KEY') || '';

    // Call Pakasir API to get raw QRIS string so we can render it in our own UI.
    let qrString = '';
    let totalPayment = amount;
    let expiredAt = '';
    try {
      const pres = await pakasirCreateQrisCompat(slug, orderId, amount, apiKey);
      const pjson: any = await pres.json().catch(() => ({}));
      const p = pjson?.payment || {};
      qrString = String(p.payment_number || '');
      totalPayment = Number(p.total_payment || amount);
      expiredAt = String(p.expired_at || '');
      if (!pres.ok || !qrString) {
        return new Response(JSON.stringify({ error: 'pakasir_create_failed', detail: pjson }), { status: 502, headers: corsHeaders });
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: 'pakasir_unreachable', detail: String(e) }), { status: 502, headers: corsHeaders });
    }

    // Capture user_id from JWT if logged in (required for QRIS purchase, but allow guest fallback for replay_only — frontend enforces login)
    let userId: string | null = null;
    try {
      const auth = req.headers.get('Authorization') || '';
      const jwt = auth.replace(/^Bearer\s+/i, '');
      if (jwt) {
        const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
        const { data: ud } = await userClient.auth.getUser();
        userId = ud?.user?.id || null;
      }
    } catch { /* ignore */ }

    const { data: order, error: orderErr } = await admin.from('orders').insert({
      user_id: userId,
      user_phone: phone,
      replay_id: resolvedReplayId,
      show_id: resolvedShowId,
      item_title: itemTitle,
      amount,
      status: 'pending',
      kind,
      pakasir_order_id: orderId,
      pakasir_qr_url: qrUrl,
    }).select('id').single();
    if (orderErr) return new Response(JSON.stringify({ error: orderErr.message }), { status: 500, headers: corsHeaders });

    return new Response(JSON.stringify({
      ok: true, order_id: order.id, pakasir_order_id: orderId, amount,
      qr_url: qrUrl, qr_string: qrString, total_payment: totalPayment, expired_at: expiredAt,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
