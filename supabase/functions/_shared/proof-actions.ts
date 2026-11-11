// Logika bersama untuk tombol Setujui / Tolak / Reset / Salin di Bukti Transfer.
// Dipakai oleh admin-approve-proof (panel admin) dan telegram-webhook (bot admin),
// sehingga hasil kedua jalur identik.
import { reviewTransition } from './approval-gate.ts';
import { buildCopyMessage } from './proof-message.ts';

export type ProofAction = 'approve' | 'reject' | 'reset' | 'message';
export type ProofActionInput = {
  proof_id: string; action: ProofAction;
  kind?: 'membership' | 'show' | 'replay'; target_id?: string; phone?: string; email?: string;
};
export type ProofActionResult = { status: number; body: Record<string, unknown> };

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): ProofActionResult => ({ status, body: { error, ...extra } });

// deno-lint-ignore no-explicit-any
export async function runProofAction(admin: any, input: ProofActionInput): Promise<ProofActionResult> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const { data: proof, error: pErr } = await admin.from('membership_payment_proofs').select('*').eq('id', input.proof_id).maybeSingle();
  if (pErr || !proof) return fail(404, 'proof_not_found');

  const action = input.action;
  if (action === 'reject' || action === 'reset') {
    const table = proof.order_id ? 'membership_orders' : 'orders';
    const linkedId = proof.order_id || proof.show_order_id;
    let status: string | undefined;
    if (linkedId) {
      const { data: order, error } = await admin.from(table).select('id,status').eq('id', linkedId).maybeSingle();
      if (error || !order) return fail(404, 'order_not_found');
      status = order.status;
    }
    if (status === 'paid' || proof.review_status === 'approved') return fail(409, 'already_approved');
    const next = reviewTransition(action, status);
    if (linkedId) {
      const { error } = await admin.from(table).update({ status: next.status }).eq('id', linkedId);
      if (error) throw error;
    }
    const { error } = await admin.from('membership_payment_proofs').update({ handled: next.handled, review_status: next.review_status }).eq('id', proof.id);
    if (error) throw error;
    return { status: 200, body: { ok: true, status: next.status } };
  }

  const manualKind = String(input.kind || '');
  const targetId = String(input.target_id || '');
  const manualPhone = String(input.phone || proof.phone || '').replace(/\D/g, '');
  const manualEmail = String(input.email || proof.email || '');

  if (!proof.order_id && !proof.show_order_id && manualKind && targetId) {
    if (manualKind === 'membership') {
      const { data: pkg } = await admin.from('membership_packages').select('id,name,price_idr,pakasir_amount').eq('id', targetId).maybeSingle();
      if (!pkg) return fail(404, 'package_not_found');
      const { data: mo, error: moErr } = await admin.from('membership_orders').insert({
        package_id: pkg.id, user_id: proof.user_id, email: manualEmail, phone: manualPhone, kind: 'qris',
        amount: Number(pkg.pakasir_amount || pkg.price_idr || 0), status: 'reserved',
        reserved_until: new Date(Date.now() + 3600_000).toISOString(),
      }).select('id').single();
      if (moErr || !mo) return fail(500, 'create_membership_order_failed', { detail: moErr?.message });
      await admin.from('membership_payment_proofs').update({ order_id: mo.id }).eq('id', proof.id);
      proof.order_id = mo.id;
    } else if (manualKind === 'show' || manualKind === 'replay') {
      const isShow = manualKind === 'show';
      const { data: target } = isShow
        ? await admin.from('active_shows').select('id,title,price_show').eq('id', targetId).maybeSingle()
        : await admin.from('replays').select('id,title').eq('id', targetId).maybeSingle();
      if (!target) return fail(404, 'target_not_found');
      const { data: so, error: soErr } = await admin.from('orders').insert({
        user_id: proof.user_id, user_phone: manualPhone, show_id: isShow ? targetId : null, replay_id: isShow ? null : targetId,
        item_title: target.title || '', amount: Number(proof.amount || target.price_show || 0), status: 'pending',
        kind: isShow ? 'show' : 'replay_only',
      }).select('id').single();
      if (soErr || !so) return fail(500, 'create_show_order_failed', { detail: soErr?.message });
      await admin.from('membership_payment_proofs').update({ show_order_id: so.id }).eq('id', proof.id);
      proof.show_order_id = so.id;
    }
  }

  if (action === 'message') {
    const msg = await buildCopyMessage(admin, proof);
    if (!msg) return fail(409, 'token_not_ready');
    return { status: 200, body: { ok: true, message: msg } };
  }

  let orderKind: 'membership' | 'show';
  let orderIdToPoll: string;
  if (proof.order_id) {
    orderKind = 'membership'; orderIdToPoll = proof.order_id;
    const { data: mo } = await admin.from('membership_orders').select('id,status').eq('id', proof.order_id).maybeSingle();
    if (!mo) return fail(404, 'membership_order_not_found');
    if (mo.status !== 'paid') await admin.from('membership_orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', mo.id);
  } else if (proof.show_order_id) {
    orderKind = 'show'; orderIdToPoll = proof.show_order_id;
    const { data: so } = await admin.from('orders').select('id,status').eq('id', proof.show_order_id).maybeSingle();
    if (!so) return fail(404, 'show_order_not_found');
    if (so.status !== 'paid') await admin.from('orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', so.id);
  } else {
    return fail(400, 'proof_has_no_order');
  }

  let finalize: unknown = null;
  try {
    const fnRes = await fetch(`${SUPABASE_URL}/functions/v1/check-pakasir-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify({ order_id: orderIdToPoll }),
    });
    const result = await fnRes.json().catch(() => ({}));
    if (!fnRes.ok || result.error) throw new Error(result.error || 'finalize_failed');
    finalize = result;
  } catch (e) {
    return fail(500, 'finalize_failed', { detail: String(e) });
  }
  await admin.from('membership_payment_proofs').update({ handled: true, review_status: 'approved' }).eq('id', proof.id);
  return { status: 200, body: { ok: true, order_kind: orderKind, order_id: orderIdToPoll, finalize } };
}
