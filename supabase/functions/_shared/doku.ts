import { createClient } from 'npm:@supabase/supabase-js@2';
import { inspectDokuPayment, dokuInvoiceReusable, snapSignature } from './doku-rules.ts';

export const PAID_STATUSES = new Set(['paid']);
const GENERATE = '/snap-adapter/b2b/v1.0/qr/qr-mpm-generate';
const QUERY = '/snap-adapter/b2b/v1.0/qr/qr-mpm-query';
const required = ['DOKU_CLIENT_ID', 'DOKU_SECRET_KEY', 'DOKU_PRIVATE_KEY', 'DOKU_MERCHANT_ID', 'DOKU_TERMINAL_ID', 'DOKU_POSTAL_CODE'];
export function dokuConfiguration() {
  const missing = required.filter(name => !Deno.env.get(name));
  const environment = Deno.env.get('DOKU_ENVIRONMENT') || 'sandbox';
  return { configured: !missing.length && ['sandbox', 'production'].includes(environment), missing, environment };
}
function config() {
  const state = dokuConfiguration();
  if (!state.configured) throw new Error('DOKU belum diaktifkan. Hubungi admin untuk pembayaran.');
  const clientId = Deno.env.get('DOKU_CLIENT_ID') || '';
  const secret = Deno.env.get('DOKU_SECRET_KEY') || '';
  const privateKey = Deno.env.get('DOKU_PRIVATE_KEY') || '';
  const merchantId = Deno.env.get('DOKU_MERCHANT_ID') || '';
  const terminalId = Deno.env.get('DOKU_TERMINAL_ID') || '';
  const postalCode = Deno.env.get('DOKU_POSTAL_CODE') || '';
  if (!/^\d{5}$/.test(postalCode) || !/^[a-zA-Z0-9]{3,16}$/.test(terminalId)) throw new Error('Pengaturan merchant DOKU tidak valid.');
  return { ...state, clientId, secret, privateKey, merchantId, terminalId, postalCode, base: state.environment === 'production' ? 'https://api.doku.com' : 'https://api-sandbox.doku.com' };
}
function db() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Payment storage unavailable');
  return createClient(url, key);
}
let tokenCache: { value: string; until: number; environment: string } | undefined;
let tokenFlight: Promise<string> | undefined;
async function accessToken(c: ReturnType<typeof config>) {
  if (tokenCache && tokenCache.environment === c.environment && tokenCache.until > Date.now()) return tokenCache.value;
  if (tokenFlight) return tokenFlight;
  tokenFlight = (async () => {
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const pem = c.privateKey.replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
    let key: CryptoKey;
    try { key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), char => char.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']); }
    catch { throw new Error('Kunci RSA DOKU harus berupa PKCS8 PEM yang terdaftar.'); }
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${c.clientId}|${timestamp}`));
    const response = await fetch(`${c.base}/authorization/v1/access-token/b2b`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CLIENT-KEY': c.clientId, 'X-TIMESTAMP': timestamp, 'X-SIGNATURE': btoa(String.fromCharCode(...new Uint8Array(signature))) },
      body: JSON.stringify({ grantType: 'client_credentials' }), signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => ({}));
    // Never log or return token responses or credential-derived signatures.
    if (!response.ok || data.responseCode !== '2007300' || typeof data.accessToken !== 'string') throw new Error(`Otorisasi DOKU gagal (HTTP ${response.status}).`);
    tokenCache = { value: data.accessToken, until: Date.now() + Math.max(0, Number(data.expiresIn || 900) - 60) * 1000, environment: c.environment };
    return tokenCache.value;
  })();
  try { return await tokenFlight; } finally { tokenFlight = undefined; }
}
async function request(path: string, payload: Record<string, unknown>, timeout = 12000) {
  const c = config();
  const token = await accessToken(c);
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const body = JSON.stringify(payload);
  const random = new Uint32Array(3); crypto.getRandomValues(random);
  const externalId = `${Date.now()}${Array.from(random, n => String(n).padStart(10, '0')).join('')}`.slice(0, 36);
  const response = await fetch(`${c.base}${path}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-PARTNER-ID': c.clientId, 'X-EXTERNAL-ID': externalId,
    'X-TIMESTAMP': timestamp, 'X-SIGNATURE': await snapSignature(c.secret, 'POST', path, token, body, timestamp),
    Authorization: `Bearer ${token}`, 'CHANNEL-ID': 'H2H',
  }, body, signal: AbortSignal.timeout(timeout) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`DOKU menolak permintaan (HTTP ${response.status}, kode ${String(data.responseCode || 'unknown').replace(/[^0-9]/g, '')}).`);
  return data;
}
// Compatible shape for existing checkout and reservation/fulfillment paths.
export async function dokuCreateQrisCompat(_clientId: string, orderId: string, amount: number, _secret: string) {
  if (!/^dk[a-zA-Z0-9_-]{1,62}$/.test(orderId) || !Number.isSafeInteger(amount) || amount < 100) throw new Error('Invalid DOKU invoice');
  const c = config(); const admin = db();
  const { data: existing, error: readError } = await admin.from('doku_transactions').select('*').eq('order_id', orderId).maybeSingle();
  if (readError) throw new Error('Payment storage unavailable');
  if (existing) {
    if (!dokuInvoiceReusable(existing, amount, c.environment)) throw new Error('Tagihan QRIS sudah kedaluwarsa atau nominal berubah. Buat tagihan baru.');
    return qrResponse(existing);
  }
  // Unique insert prevents concurrent generation; an uncertain upstream result is never regenerated blindly.
  const { error: claimError } = await admin.from('doku_transactions').insert({ order_id: orderId, amount, environment: c.environment });
  if (claimError) throw new Error('Tagihan sedang diproses. Coba kembali.');
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const data = await request(GENERATE, { partnerReferenceNo: orderId, amount: { value: amount.toFixed(2), currency: 'IDR' }, merchantId: c.merchantId, terminalId: c.terminalId, validityPeriod: expiresAt, additionalInfo: { postalCode: c.postalCode, feeType: 1 } });
  if (data.responseCode !== '2004700' || data.partnerReferenceNo !== orderId || !data.referenceNo || !data.qrContent) throw new Error('DOKU tidak mengembalikan QRIS yang valid.');
  const row = { reference_no: String(data.referenceNo), qr_content: String(data.qrContent), expires_at: data.additionalInfo?.validityPeriod || expiresAt, amount, status: 'pending' };
  const { error: saveError } = await admin.from('doku_transactions').update(row).eq('order_id', orderId);
  if (saveError) throw new Error('Gagal menyimpan tagihan QRIS.');
  return qrResponse(row);
}
function qrResponse(row: { qr_content: string; amount: number; expires_at: string }) {
  const payment = { payment_number: row.qr_content, total_payment: row.amount, expired_at: row.expires_at };
  return { ok: true, status: 200, json: async () => ({ payment, transaction: payment }) };
}
export async function verifyDokuPaidStrict(_secret: string, _clientId: string, orderId: string, amount: number, timeout = 12000) {
  if (!orderId?.startsWith('dk')) return { paid: false, status: 'legacy_provider_disabled' };
  if (!dokuConfiguration().configured) return { paid: false, status: 'not_configured' };
  try {
    const c = config(); const admin = db();
    const { data: row, error } = await admin.from('doku_transactions').select('*').eq('order_id', orderId).maybeSingle();
    if (error || !row?.reference_no || row.amount !== amount || row.environment !== c.environment) return { paid: false, status: 'unverified' };
    // Test payments never issue real tokens or credit real coin balances.
    if (row.environment !== 'production') return { paid: false, status: 'sandbox' };
    const data = await request(QUERY, { originalReferenceNo: row.reference_no, originalPartnerReferenceNo: orderId, serviceCode: '47', merchantId: c.merchantId }, timeout);
    const result = inspectDokuPayment(data, orderId, row.reference_no, amount);
    await admin.from('doku_transactions').update({ status: result.status, checked_at: new Date().toISOString() }).eq('order_id', orderId);
    return result;
  } catch { return { paid: false, status: 'unreachable' }; }
}
export async function validateDokuNotification(req: Request, body: Record<string, unknown>) {
  const c = config();
  const timestamp = req.headers.get('x-timestamp') || '';
  if (req.headers.get('x-partner-id') !== c.clientId || !timestamp || !Number.isFinite(Date.parse(timestamp))) return false;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const signature = req.headers.get('x-signature') || '';
  const expected = await snapSignature(c.secret, 'POST', '/functions/v1/doku-webhook', token, JSON.stringify(body), timestamp);
  if (signature.length !== expected.length) return false;
  let different = 0; for (let i = 0; i < expected.length; i++) different |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  return different === 0;
}
export async function testDokuConnection() { await accessToken(config()); }