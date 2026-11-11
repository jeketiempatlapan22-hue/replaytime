import { queuePaidSweep } from '../_shared/telegram-admin.ts';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { dokuConfiguration, validateDokuNotification, verifyDokuPaidStrict } from '../_shared/doku.ts';

const schema = z.object({ originalPartnerReferenceNo: z.string().regex(/^dk[a-zA-Z0-9_-]{1,62}$/), originalReferenceNo: z.string().min(1).max(64) }).passthrough();
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method !== 'OPTIONS') queuePaidSweep();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return respond(405, { error: 'method_not_allowed' });
  if (!dokuConfiguration().configured) return respond(503, { error: 'doku_not_configured' });
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return respond(400, { error: 'invalid_notification' });
    if (!await validateDokuNotification(req, parsed.data)) return respond(401, { error: 'invalid_signature' });
    const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return respond(503, { error: 'storage_unavailable' });
    const admin = createClient(url, key);
    const { data: txn } = await admin.from('doku_transactions').select('reference_no,amount').eq('order_id', parsed.data.originalPartnerReferenceNo).maybeSingle();
    if (!txn || txn.reference_no !== parsed.data.originalReferenceNo) return respond(404, { error: 'invoice_not_found' });
    // Notification status/amount are never used as proof. Query DOKU independently.
    const verified = await verifyDokuPaidStrict('', '', parsed.data.originalPartnerReferenceNo, Number(txn.amount));
    if (!verified.paid) return respond(503, { error: 'payment_not_verified' });
    for (const table of ['orders', 'membership_orders']) {
      const { data: order } = await admin.from(table).select('id').eq('pakasir_order_id', parsed.data.originalPartnerReferenceNo).maybeSingle();
      if (!order) continue;
      const response = await fetch(`${url}/functions/v1/check-doku-status`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key }, body: JSON.stringify({ order_id: order.id }) });
      if (!response.ok) return respond(503, { error: 'fulfillment_retry_required' });
    }
    const { data: bill } = await admin.from('reseller_bills').select('id').eq('pakasir_order_id', parsed.data.originalPartnerReferenceNo).maybeSingle();
    if (bill) {
      const { error } = await admin.rpc('mark_reseller_bill_paid', { _bill_id: bill.id });
      if (error) return respond(503, { error: 'bill_retry_required' });
    }
    return respond(200, { responseMessage: 'Successful' });
  } catch { return respond(503, { error: 'notification_retry_required' }); }
});