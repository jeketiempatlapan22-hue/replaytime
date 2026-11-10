// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { gatherChatCredentials } from '../chatCredentials';
import { saveMembershipCredentials } from '../membershipAccess';
import { setShowPurchase } from '../purchases';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
describe('chat access identity', () => {
  it('uses the show access in preference to an unrelated saved membership', () => {
    saveMembershipCredentials('OLD-MEMBERSHIP', 'OLD-PASSWORD');
    expect(gatherChatCredentials('show-1', '?t=SHOW-TOKEN')).toEqual({ token: 'SHOW-TOKEN', mtoken: '', btoken: '', pw: '' });
  });
  it('finds a purchased show token when the URL no longer contains it', () => {
    setShowPurchase('show-1', { token: 'PAID-TOKEN', kind: 'show', paidAt: 1 });
    expect(gatherChatCredentials('show-1', '').token).toBe('PAID-TOKEN');
  });
  it('keeps explicit membership credentials', () => {
    expect(gatherChatCredentials('', '?mtoken=MEMBER&mp=123456')).toEqual({ token: '', mtoken: 'MEMBER', btoken: '', pw: '123456' });
  });
});