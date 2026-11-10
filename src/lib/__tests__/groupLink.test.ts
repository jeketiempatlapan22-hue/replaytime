import { describe, expect, it } from 'vitest';
import { resolveGroupLink, appendGroupLink, membershipGroupLink } from '../../../supabase/functions/_shared/group-link';

describe('buyer groups', () => {
  const admin = 'https://chat.whatsapp.com/admin';
  const reseller = 'https://chat.whatsapp.com/reseller';
  it('inherits the administrator group for a normal purchase', () => {
    expect(resolveGroupLink(admin, null)).toBe(admin);
  });
  it('uses the reseller group without changing the administrator group', () => {
    expect(resolveGroupLink(admin, reseller)).toBe(reseller);
  });
  it('removes the group when the reseller explicitly chooses no group', () => {
    expect(resolveGroupLink(admin, '')).toBe('');
  });
  it('includes the group once in access messages', () => {
    const message = appendGroupLink('Link akses', admin);
    expect(message).toContain(admin);
    expect(appendGroupLink(message, admin)).toBe(message);
  });
  it('rejects executable group addresses', () => {
    expect(resolveGroupLink('javascript:alert(1)')).toBe('');
  });
  it('reads the purchased membership package group', async () => {
    const client = { from: () => ({ select: () => ({ eq: (_key: string, id: string) => ({ maybeSingle: async () => ({ data: { group_link: id === 'purchased-package' ? admin : '' } }) }) }) }) };
    expect(await membershipGroupLink(client, { package_id: 'purchased-package', group_link_override: null })).toBe(admin);
  });
  it('does not restore the package group after a reseller removes it', async () => {
    const client = { from: () => { throw new Error('must not fetch inherited group'); } };
    expect(await membershipGroupLink(client, { package_id: 'purchased-package', group_link_override: '' })).toBe('');
  });
});