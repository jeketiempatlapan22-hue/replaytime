import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { verifyDokuPaidStrict } from '../_shared/doku.ts';
// Polls DOKU for a reseller bill. If paid, marks bill paid + wipes copy log.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';



Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const billId = String(body.bill_id ?? '');
    const phone = String(body.phone ?? '').trim();
    const pin = String(body.pin ?? '').trim();
    if (!billId || !phone || !pin) {
      return new Response(JSON.stringify({ error: 'missing_params' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient((Deno.env.get('SUPABASE_URL') || ''), (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''));
    const slug = 'doku';
    const apiKey = 'server-managed';

    const { data: ok } = await admin.rpc('reseller_verify', { _phone: phone, _pin: pin });
    if (!ok) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const { data: bill } = await admin.from('reseller_bills').select('*').eq('id', billId).maybeSingle();
    if (!bill || bill.reseller_phone !== phone) {
      return new Response(JSON.stringify({ error: 'bill_not_found' }), { status: 404, headers: corsHeaders });
    }
    if (bill.status === 'paid') {
      return new Response(JSON.stringify({ ok: true, status: 'paid', already: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!bill.pakasir_order_id) {
      return new Response(JSON.stringify({ ok: true, status: 'pending' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const v = await verifyDokuPaidStrict(apiKey, slug, bill.pakasir_order_id, Number(bill.amount));
    const ps = v.status;
    const paid = v.paid;

    if (!paid) {
      return new Response(JSON.stringify({ ok: true, status: ps || 'pending' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: merr } = await admin.rpc('mark_reseller_bill_paid', { _bill_id: bill.id });
    if (merr) {
      return new Response(JSON.stringify({ error: 'mark_failed', detail: merr.message }), { status: 500, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ ok: true, status: 'paid' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
