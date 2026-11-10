import { describe, it, expect } from 'vitest';
import { isGatedOrder, holdForApproval, holdMembershipForApproval, reviewTransition } from '../../../supabase/functions/_shared/approval-gate';

function fakeAdmin(mode: string) {
  const calls: any[] = [];
  const q: any = (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => (table === 'site_settings' ? { data: { value: mode } } : { data: null }) }) }),
    update: (v: any) => ({ eq: async () => { calls.push(['update', table, v]); return { error: null }; } }),
    insert: async (v: any) => { calls.push(['insert', table, v]); return { error: null }; },
  });
  return { from: q, calls };
}

describe('admin approval gate', () => {
  it('gates show, replay and bundle orders but not coin top-ups', () => {
    expect(isGatedOrder({ kind: 'show', status: 'pending' })).toBe(true);
    expect(isGatedOrder({ kind: 'replay_only', status: 'pending' })).toBe(true);
    expect(isGatedOrder({ kind: 'bundle', status: 'pending' })).toBe(true);
    expect(isGatedOrder({ kind: 'coin_topup', status: 'pending' })).toBe(false);
  });
  it('never re-gates an order the admin already approved', () => {
    expect(isGatedOrder({ kind: 'show', status: 'paid' })).toBe(false);
  });
  it('holds a paid order as awaiting_approval when the mode is on', async () => {
    const a = fakeAdmin('true');
    const order = { id: 'o1', kind: 'show', status: 'pending', user_phone: '628123' };
    expect(await holdForApproval(a, order)).toBe(true);
    expect(order.status).toBe('awaiting_approval');
    expect(a.calls.some((c) => c[0] === 'insert' && c[1] === 'membership_payment_proofs')).toBe(true);
  });
  it('lets the order through when the mode is off', async () => {
    const a = fakeAdmin('false');
    expect(await holdForApproval(a, { id: 'o2', kind: 'show', status: 'pending' })).toBe(false);
  });
  it('holds confirmed guest membership with its own proof and no token', async () => {
    const a = fakeAdmin('true');
    const order = { id: 'm1', package_id: 'p1', status: 'reserved', user_id: null, phone: '628123', email: 'buyer@example.test', amount: 10000 };
    expect(await holdMembershipForApproval(a, order, 'Pakasir')).toBe(true);
    expect(order.status).toBe('awaiting_approval');
    expect(a.calls.find(c => c[0] === 'update')[1]).toBe('membership_orders');
    expect(a.calls.find(c => c[0] === 'insert')[2]).toMatchObject({ order_id: 'm1', user_id: null, phone: '628123', amount: 10000 });
    expect(a.calls.some(c => c[1] === 'membership_tokens')).toBe(false);
  });
  it('does not activate rejected membership even when approval mode is later off', async () => {
    const a = fakeAdmin('false');
    expect(await holdMembershipForApproval(a, { id: 'm1', status: 'rejected' })).toBe(true);
    expect(a.calls).toEqual([]);
  });
  it('allows already approved membership to finalize', async () => {
    expect(await holdMembershipForApproval(fakeAdmin('true'), { status: 'paid' })).toBe(false);
  });
  it('keeps automatic membership activation when approval mode is off', async () => {
    expect(await holdMembershipForApproval(fakeAdmin('false'), { status: 'reserved' })).toBe(false);
  });
  it('rejects manual proof without a gateway or linked order', () => {
    expect(reviewTransition('reject')).toEqual({ status: 'rejected', review_status: 'rejected', handled: true });
  });
  it('resets rejected membership or manual proof back to pending review', () => {
    expect(reviewTransition('reset', 'rejected')).toEqual({ status: 'awaiting_approval', review_status: 'pending', handled: false });
  });
  it('does not reset access that has already been approved', () => {
    expect(() => reviewTransition('reset', 'paid')).toThrow('already_approved');
  });
});
