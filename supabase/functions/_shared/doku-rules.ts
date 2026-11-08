// DOKU SNAP QRIS: only a successful query with exact references and IDR amount unlocks access.
export function inspectDokuPayment(body: Record<string, any>, orderId: string, referenceNo: string, amount: number) {
  const code = String(body.latestTransactionStatus || '');
  const statuses: Record<string, string> = { '00': 'paid', '03': 'pending', '04': 'refunded', '05': 'cancelled', '06': 'failed', '07': 'not_found' };
  if (String(body.responseCode) !== '2005100') return { paid: false, status: 'unverified' };
  if (body.originalPartnerReferenceNo !== orderId || body.originalReferenceNo !== referenceNo) return { paid: false, status: 'mismatch' };
  if (body.amount?.currency !== 'IDR' || Number(body.amount?.value) !== amount || !Number.isSafeInteger(amount) || amount < 100) return { paid: false, status: 'mismatch' };
  return { paid: code === '00', status: statuses[code] || 'unverified' };
}

export function dokuInvoiceReusable(row: { amount: number; expires_at: string; qr_content: string; environment: string }, amount: number, environment: string, now = Date.now()) {
  return row.amount === amount && row.environment === environment && !!row.qr_content && new Date(row.expires_at).getTime() > now;
}

export async function snapSignature(secret: string, method: string, path: string, accessToken: string, body: string, timestamp: string) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(body));
  const hex = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${method}:${path}:${accessToken}:${hex}:${timestamp}`));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}