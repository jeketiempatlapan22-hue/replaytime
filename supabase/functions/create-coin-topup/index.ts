import { waGuard } from '../_shared/wa-check.ts';
import { pakasirCreateQrisCompat } from '../_shared/pakasir.ts';
// Create a Pakasir QRIS order to top-up coins for the authenticated user.
// kind='coin_topup' so webhook/poll credit coins instead of issuing a token.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
function validPhone(p: string) { return /^628\d{8,11}$/.test(p); }
function genOrderId() { return `tc${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const packageId = String(body.package_id ?? '');
    const phone = normalizePhone(String(body.phone ?? ''));
    if (!validPhone(phone)) return new Response(JSON.stringify({ error: 'invalid_phone' }), { status: 400, headers: corsHeaders });
    { const wa = await waGuard(phone); if (wa) return new Response(JSON.stringify({ error: wa }), { status: 400, headers: corsHeaders }); }
    if (!packageId) return new Response(JSON.stringify({ error: 'missing_package' }), { status: 400, headers: corsHeaders });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const slug = Deno.env.get('PAKASIR_PROJECT_SLUG');
    const apiKey = Deno.env.get('PAKASIR_API_KEY') || '';
    if (!slug) return new Response(JSON.stringify({ error: 'pakasir_not_configured' }), { status: 500, headers: corsHeaders });

    const { data: pkg } = await admin.from('coin_packages').select('*').eq('id', packageId).eq('enabled', true).maybeSingle();
    if (!pkg) return new Response(JSON.stringify({ error: 'package_not_found' }), { status: 404, headers: corsHeaders });
    const amount = Number(pkg.price_idr || 0);
    const coins = Number(pkg.coins || 0);
    if (amount < 100 || coins <= 0) return new Response(JSON.stringify({ error: 'invalid_package' }), { status: 400, headers: corsHeaders });

    const orderId = genOrderId();
    const qrUrl = `https://app.pakasir.com/pay/${slug}/${orderId}?amount=${amount}&qris_only=1`;
    let qrString = ''; let totalPayment = amount; let expiredAt = '';
    try {
      const pres = await pakasirCreateQrisCompat(slug, orderId, amount, apiKey);
      const pjson: any = await pres.json().catch(() => ({}));
      const p = pjson?.payment || {};
      qrString = String(p.payment_number || '');
      totalPayment = Number(p.total_payment || amount);
      expiredAt = String(p.expired_at || '');
      if (!pres.ok || !qrString) return new Response(JSON.stringify({ error: 'pakasir_create_failed', detail: pjson }), { status: 502, headers: corsHeaders });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'pakasir_unreachable', detail: String(e) }), { status: 502, headers: corsHeaders });
    }

    const { data: order, error: oerr } = await admin.from('orders').insert({
      user_id: user.id, user_phone: phone, item_title: `Top-up ${coins} koin`,
      amount, status: 'pending', kind: 'coin_topup',
      coin_package_id: pkg.id, coin_amount: coins,
      pakasir_order_id: orderId, pakasir_qr_url: qrUrl,
    }).select('id').single();
    if (oerr) return new Response(JSON.stringify({ error: oerr.message }), { status: 500, headers: corsHeaders });

    return new Response(JSON.stringify({
      ok: true, order_id: order.id, pakasir_order_id: orderId, amount, coins,
      qr_url: qrUrl, qr_string: qrString, total_payment: totalPayment, expired_at: expiredAt,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
