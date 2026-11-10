import { readMembershipCredentials } from '@/lib/membershipAccess';
import { getShowPurchase } from '@/lib/purchases';

export function gatherChatCredentials(showId = '', search = window.location.search) {
  const sp = new URLSearchParams(search);
  const token = sp.get('t') || sp.get('token') || getShowPurchase(showId)?.token || '';
  const explicitMembership = sp.get('mtoken') || '';
  const btoken = sp.get('btoken') || '';
  const explicitPassword = sp.get('pw') || sp.get('mp') || '';
  const savedMembership = !token && !btoken && !explicitPassword ? readMembershipCredentials() : null;
  return {
    token,
    mtoken: explicitMembership || savedMembership?.token || '',
    btoken,
    pw: explicitPassword || (explicitMembership ? readMembershipCredentials()?.password : savedMembership?.password) || '',
  };
}