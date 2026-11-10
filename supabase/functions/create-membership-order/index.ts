import { waGuard } from '../_shared/wa-check.ts';
import { pakasirCreateQrisCompat } from '../_shared/pakasir.ts';
// Reserve sebuah slot membership lalu buat QRIS pakasir. Guest OK untuk QRIS (login opsional).
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
const validPhone = (p: string) => /^628\d{8,11}$/.test(p);
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const genOrderId = () => `mb${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Login OPSIONAL untuk QRIS. Jika ada JWT, kita ambil user_id; jika tidak, guest.
    let userId: string | null = null;
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.replace(/^Bearer\s+/i, '');
    if (jwt) {
      try {
        const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
        const { data: ud } = await userClient.auth.getUser();
        userId = ud?.user?.id || null;
      } catch { /* ignore — treat as guest */ }
    }

    const body = await req.json().catch(() => ({}));
    const package_id = String(body.package_id || '');
    const email = String(body.email || '').trim().toLowerCase();
    const phone = normalizePhone(String(body.phone || ''));
    if (!package_id) return new Response(JSON.stringify({ error: 'missing_package' }), { status: 400, headers: corsHeaders });
    if (!validEmail(email)) return new Response(JSON.stringify({ error: 'invalid_email' }), { status: 400, headers: corsHeaders });
    if (!validPhone(phone)) return new Response(JSON.stringify({ error: 'invalid_phone' }), { status: 400, headers: corsHeaders });
    { const wa = await waGuard(phone); if (wa) return new Response(JSON.stringify({ error: wa }), { status: 400, headers: corsHeaders }); }


    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const slug = Deno.env.get('PAKASIR_PROJECT_SLUG');
    const apiKey = Deno.env.get('PAKASIR_API_KEY') || '';
    if (!slug) return new Response(JSON.stringify({ error: 'pakasir_not_configured' }), { status: 500, headers: corsHeaders });

    // Reserve slot atomically — guest OK for QRIS (user_id may be null)
    const { data: rsv, error: rerr } = await admin.rpc('reserve_membership_slot', {
      _package_id: package_id, _user_id: userId, _email: email, _phone: phone, _kind: 'qris',
    });

    if (rerr) {
      const msg = rerr.message || '';
      const known = ['sold_out','package_closed','package_not_found','invalid_kind','invalid_email','invalid_phone','invalid_price'];
      const code = known.find((k) => msg.includes(k)) || 'reserve_failed';
      return new Response(JSON.stringify({ error: code, detail: msg }), { status: 400, headers: corsHeaders });
    }
    const row = Array.isArray(rsv) ? rsv[0] : rsv;
    if (!row?.order_id) return new Response(JSON.stringify({ error: 'reserve_failed' }), { status: 500, headers: corsHeaders });

    const amount = Number(row.amount || 0);
    const orderId = genOrderId();

    // Call Pakasir
    let qrString = ''; let totalPayment = amount; let expiredAt = '';
    try {
      const pres = await pakasirCreateQrisCompat(slug, orderId, amount, apiKey);
      const pjson: any = await pres.json().catch(() => ({}));
      const p = pjson?.payment || {};
      qrString = String(p.payment_number || '');
      totalPayment = Number(p.total_payment || amount);
      expiredAt = String(p.expired_at || '');
      if (!pres.ok || !qrString) {
        // release slot
        await admin.rpc('release_membership_slot', { _order_id: row.order_id, _reason: 'cancelled' });
        return new Response(JSON.stringify({ error: 'pakasir_create_failed', detail: pjson }), { status: 502, headers: corsHeaders });
      }
    } catch (e) {
      await admin.rpc('release_membership_slot', { _order_id: row.order_id, _reason: 'cancelled' });
      return new Response(JSON.stringify({ error: 'pakasir_unreachable', detail: String(e) }), { status: 502, headers: corsHeaders });
    }

    const qrUrl = `https://app.pakasir.com/pay/${slug}/${orderId}?amount=${amount}&qris_only=1`;
    await admin.from('membership_orders').update({
      pakasir_order_id: orderId, pakasir_qr_url: qrUrl, updated_at: new Date().toISOString(),
    }).eq('id', row.order_id);

    return new Response(JSON.stringify({
      ok: true, order_id: row.order_id, pakasir_order_id: orderId,
      amount, qr_url: qrUrl, qr_string: qrString, total_payment: totalPayment,
      expired_at: expiredAt, reserved_until: row.reserved_until,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
