import { describe, it, expect } from 'vitest';
import { buildCopyMessage } from '../../../supabase/functions/_shared/proof-message';

function client(kind: string) {
  const data: Record<string, any> = {
    site_settings: [{ key: 'link_origin', value: 'https://www.website-a.test/private' }],
    orders: { access_token: 'token-test', kind, user_phone: '628123456789', item_title: 'Show', show_id: kind === 'show' ? 'show1' : null, replay_id: kind === 'replay_only' ? 'r1' : null },
    active_shows: { live_password: 'SHOW66', replay_info: 'Info replay', group_link_enabled: true, group_link: 'https://chat.whatsapp.com/group' },
    active_show_tokens: {}, show_bundle_tokens: { password: 'BUND66' }, replays: { password: 'REPL66' },
    membership_orders: { membership_token_id: 'm1', package_id: 'p1', phone: '628123456789' },
    membership_tokens: { token: 'member', password: 'CUST66', expires_at: '2026-12-11', package_id: 'p1' },
    membership_packages: { name: 'Membership', replay_info: 'Replay member', group_link: 'https://chat.whatsapp.com/member' },
  };
  return { rpc: async () => ({ error: null }), from: (table: string) => {
    const q: any = { select: () => q, eq: () => q, in: () => q, single: async () => ({ data: data[table] }), maybeSingle: async () => ({ data: data[table] }), then: (resolve: any) => resolve({ data: data[table] }) };
    return q;
  } };
}
describe('proof credentials', () => {
  it('copies show password and credential-bearing main-domain link before approval', async () => {
    const message = await buildCopyMessage(client('show'), { show_order_id: 'o1' });
    expect(message).toContain('SHOW66');
    expect(message).toContain('https://website-a.test/live?show=show1&t=token-test');
    expect(message).toContain('628123456789');
    expect(message).toContain('Info replay');
  });
  it('copies bundle token password', async () => {
    expect(await buildCopyMessage(client('bundle'), { show_order_id: 'o1' })).toContain('BUND66');
  });
  it('copies exact custom membership password in message and cross-domain URL', async () => {
    const message = await buildCopyMessage(client('membership'), { order_id: 'o1' });
    expect(message).toContain('Sandi: *CUST66*');
    expect(message).toContain('/live?mtoken=member&mp=CUST66');
  });
  it('copies replay password', async () => {
    expect(await buildCopyMessage(client('replay_only'), { show_order_id: 'o1' })).toContain('REPL66');
  });
});