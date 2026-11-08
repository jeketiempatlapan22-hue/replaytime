import { pakasirCreateQrisCompat } from '../_shared/pakasir.ts';
// Creates a Pakasir QRIS invoice for a reseller's outstanding bill.
// Bill must already exist via reseller_create_bill_intent.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function genOrderId() { return 'rb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const phone = String(body.phone ?? '').trim();
    const pin = String(body.pin ?? '').trim();
    if (!phone || !pin) return new Response(JSON.stringify({ error: 'missing_credentials' }), { status: 400, headers: corsHeaders });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const slug = Deno.env.get('PAKASIR_PROJECT_SLUG');
    const apiKey = Deno.env.get('PAKASIR_API_KEY') || '';
    if (!slug) return new Response(JSON.stringify({ error: 'pakasir_not_configured' }), { status: 500, headers: corsHeaders });

    // Verify reseller
    const { data: ok } = await admin.rpc('reseller_verify', { _phone: phone, _pin: pin });
    if (!ok) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    // Create or reuse pending bill via intent RPC (uses service role → bypass verify? no, it re-verifies)
    const { data: intent, error: ierr } = await admin.rpc('reseller_create_bill_intent', { _phone: phone, _pin: pin });
    if (ierr) return new Response(JSON.stringify({ error: ierr.message }), { status: 400, headers: corsHeaders });
    const row = Array.isArray(intent) ? intent[0] : intent;
    if (!row?.bill_id) return new Response(JSON.stringify({ error: 'no_bill' }), { status: 400, headers: corsHeaders });

    // Fetch bill (admin may have overridden amount)
    const { data: bill } = await admin.from('reseller_bills').select('*').eq('id', row.bill_id).maybeSingle();
    if (!bill) return new Response(JSON.stringify({ error: 'bill_not_found' }), { status: 404, headers: corsHeaders });

    const amount = Math.max(100, Number(bill.amount) || 0);

    let orderId = bill.pakasir_order_id as string | null;
    let qrUrl = bill.pakasir_qr_url as string;
    let qrString = '';
    let totalPayment = amount;
    let expiredAt = '';

    // Create new Pakasir QR if not yet, OR if amount changed since last invoice
    const needsNew = !orderId;
    if (needsNew) {
      orderId = genOrderId();
      qrUrl = `https://app.pakasir.com/pay/${slug}/${orderId}?amount=${amount}&qris_only=1`;
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
      await admin.from('reseller_bills').update({
        pakasir_order_id: orderId, pakasir_qr_url: qrUrl, updated_at: new Date().toISOString(),
      }).eq('id', bill.id);
    } else {
      // Re-query existing QR to refresh string
      try {
        const pres = await pakasirCreateQrisCompat(slug, orderId!, amount, apiKey);
        const pjson: any = await pres.json().catch(() => ({}));
        const tx = pjson?.transaction || pjson?.payment || {};
        qrString = String(tx.payment_number || '');
        totalPayment = Number(tx.total_payment || amount);
        expiredAt = String(tx.expired_at || '');
      } catch { /* ignore */ }
    }

    return new Response(JSON.stringify({
      ok: true, bill_id: bill.id, amount,
      breakdown: bill.breakdown, qr_url: qrUrl, qr_string: qrString,
      pakasir_order_id: orderId, total_payment: totalPayment, expired_at: expiredAt,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
