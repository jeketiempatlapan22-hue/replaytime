import { describe, it, expect } from 'vitest';
import { isGatedOrder, holdForApproval } from '../../../supabase/functions/_shared/approval-gate';

function fakeAdmin(mode: string) {
  const calls: any[] = [];
  const q: any = (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => (table === 'site_settings' ? { data: { value: mode } } : { data: null }) }) }),
    update: (v: any) => ({ eq: async () => { calls.push(['update', table, v]); } }),
    insert: async (v: any) => { calls.push(['insert', table, v]); },
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
});
