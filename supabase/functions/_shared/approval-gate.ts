// Admin Approval Gate: when site_settings.require_admin_approval = 'true',
// gateway-confirmed show/replay/bundle orders are held as 'awaiting_approval'
// (no token issued) until an admin approves them in Bukti Transaksi.
// Approval sets status 'paid' and delegates to check-pakasir-status to finalize.
// deno-lint-ignore-file no-explicit-any

export const GATED_KINDS = new Set(['show', 'replay', 'replay_only', 'bundle']);

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
