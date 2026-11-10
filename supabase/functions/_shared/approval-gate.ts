// Admin Approval Gate: when site_settings.require_admin_approval = 'true',
// gateway-confirmed show/replay/bundle orders are held as 'awaiting_approval'
// (no token issued) until an admin approves them in Bukti Transaksi.
// Approval sets status 'paid' and delegates to check-pakasir-status to finalize.
// deno-lint-ignore-file no-explicit-any

export const GATED_KINDS = new Set(['show', 'bundle']);

export function isGatedOrder(order: any): boolean {
  return !!order && GATED_KINDS.has(String(order.kind || '')) && order.status !== 'paid';
}

export async function approvalModeOn(admin: any): Promise<boolean> {
  const { data } = await admin.from('site_settings').select('value').eq('key', 'require_admin_approval').maybeSingle();
  return String(data?.value || '').toLowerCase() === 'true';
}

/** Returns true when the order is (now) held for admin approval. */
export async function holdForApproval(admin: any, order: any, source = 'gateway'): Promise<boolean> {
  if (!isGatedOrder(order)) return false;
  if (order.status === 'awaiting_approval' || order.status === 'rejected') return true;
  if (!(await approvalModeOn(admin))) return false;
  await admin.from('orders').update({ status: 'awaiting_approval', paid_at: new Date().toISOString() }).eq('id', order.id);
  order.status = 'awaiting_approval';
  const { data: existing } = await admin.from('membership_payment_proofs').select('id').eq('show_order_id', order.id).maybeSingle();
  if (!existing) {
    await admin.from('membership_payment_proofs').insert({
      show_order_id: order.id,
      user_id: order.user_id || null,
      phone: order.user_phone || '',
      email: '',
      package_name: order.item_title || 'Show',
      amount: Number(order.amount || 0),
      image_path: '',
      note: `✅ Lunas di ${source} — menunggu persetujuan admin`,
      handled: false,
      expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
    });
  }
  return true;
}

/** Membership orders live separately; never issue credentials while awaiting review. */
export async function holdMembershipForApproval(admin: any, order: any, source = 'gateway'): Promise<boolean> {
  if (!order || order.status === 'paid') return false;
  if (order.status === 'awaiting_approval' || order.status === 'rejected') return true;
  if (!(await approvalModeOn(admin))) return false;
  const { error } = await admin.from('membership_orders').update({
    status: 'awaiting_approval', paid_at: new Date().toISOString(),
  }).eq('id', order.id);
  if (error) throw error;
  order.status = 'awaiting_approval';
  const { data: existing, error: readError } = await admin.from('membership_payment_proofs').select('id').eq('order_id', order.id).maybeSingle();
  if (readError) throw readError;
  if (!existing) {
    const { data: pkg } = await admin.from('membership_packages').select('name').eq('id', order.package_id).maybeSingle();
    const { error: proofError } = await admin.from('membership_payment_proofs').insert({
      order_id: order.id, user_id: order.user_id || null, phone: order.phone || '',
      email: order.email || '', package_name: pkg?.name || 'Membership',
      amount: Number(order.amount || 0), image_path: '', handled: false,
      note: `✅ Lunas di ${source} — menunggu persetujuan admin`,
      expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
    });
    if (proofError) throw proofError;
  }
  return true;
}

export function reviewTransition(action: 'reject' | 'reset', orderStatus?: string) {
  if (orderStatus === 'paid') throw new Error('already_approved');
  return { status: action === 'reject' ? 'rejected' : 'awaiting_approval',
    review_status: action === 'reject' ? 'rejected' : 'pending', handled: action === 'reject' };
}
