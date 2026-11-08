// Verifikasi ketat pembayaran Pakasir (QRIS dinamis).
// Dipakai oleh pakasir-webhook, check-pakasir-status, poll-pending-orders,
// dan (lewat check-pakasir-status) alur pembelian di bot Telegram.
//
// Aturan ketat:
// - Transaksi WAJIB ditemukan di Pakasir (bukan body kosong / 404).
// - status WAJIB termasuk status lunas.
// - order_id, project, dan amount WAJIB cocok jika Pakasir mengirimkannya.
// - amount WAJIB dikembalikan Pakasir dan sama persis dengan tagihan;
//   nominal yang hilang / berbeda dianggap BELUM lunas.

export const PAID_STATUSES = new Set(['completed', 'paid', 'success', 'settled']);

export interface PakasirVerifyResult {
  paid: boolean;
  status: string;
  detail?: string;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v) !== '') return v;
  }
  return undefined;
}

export async function verifyPakasirPaidStrict(
  apiKey: string,
  slug: string,
  pakasirOrderId: string,
  amount: number,
  timeoutMs = 12000,
): Promise<PakasirVerifyResult> {
  if (!apiKey || !slug) return { paid: false, status: 'not_configured' };
  if (!pakasirOrderId) return { paid: false, status: 'invalid_order', detail: 'missing_order_id' };
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 100) {
    return { paid: false, status: 'invalid_order', detail: 'invalid_amount' };
  }

  return await verifyV2(apiKey, slug, pakasirOrderId, amt, timeoutMs);
  // deno-lint-ignore no-unreachable
  const url = `https://app.pakasir.com/api/transactiondetail?project=${encodeURIComponent(slug)}&amount=${amt}&order_id=${encodeURIComponent(pakasirOrderId)}&api_key=${encodeURIComponent(apiKey)}`;

  let res: Response;
  let body: Record<string, unknown> = {};
  try {
    res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
    body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  } catch (e) {
    return { paid: false, status: 'unreachable', detail: String(e) };
  }
  if (!res.ok) return { paid: false, status: 'unreachable', detail: `http_${res.status}` };

  const tx = ((body.transaction || body.payment || body.data) as Record<string, unknown>) || {};
  const hasTx = Object.keys(tx).length > 0;
  const status = String(pick(hasTx ? tx : body, ['status', 'payment_status', 'transaction_status']) ?? '').toLowerCase();
  if (!status) return { paid: false, status: 'not_found', detail: 'no_transaction' };
  if (!PAID_STATUSES.has(status)) return { paid: false, status };

  const returnedOrderId = String(pick(hasTx ? tx : body, ['order_id', 'orderId', 'merchant_order_id']) ?? '').trim();
  if (returnedOrderId && returnedOrderId !== pakasirOrderId) {
    return { paid: false, status: 'mismatch', detail: 'order_id_mismatch' };
  }

  const returnedProject = String(pick(hasTx ? tx : body, ['project', 'project_slug', 'slug']) ?? '').trim();
  if (returnedProject && returnedProject !== slug) {
    return { paid: false, status: 'mismatch', detail: 'project_mismatch' };
  }

  const rawAmount = pick(hasTx ? tx : body, ['amount', 'nominal', 'total', 'gross_amount']);
  const returnedAmount = Number(rawAmount);
  if (rawAmount === undefined || !Number.isFinite(returnedAmount) || returnedAmount <= 0) {
    // Nominal tidak dilaporkan Pakasir. Terima HANYA jika order_id balik dan cocok
    // (endpoint sudah difilter project+amount+order_id), selain itu anggap belum lunas.
    if (returnedOrderId && returnedOrderId === pakasirOrderId) return { paid: true, status };
    return { paid: false, status: 'unverified', detail: 'amount_missing' };
  }
  if (returnedAmount !== amt) {
    return { paid: false, status: 'mismatch', detail: `amount_mismatch:${returnedAmount}!=${amt}` };
  }

  return { paid: true, status };
}

// ===== Pakasir API v2 =====
// create-transaction bersifat "find or create": dipanggil ulang dengan order_id+amount
// yang sama selalu mengembalikan transaksi yang sama (termasuk txn_id).
export async function pakasirV2Create(
  apiKey: string, slug: string, orderId: string, amount: number, timeoutMs = 12000,
): Promise<{ ok: boolean; status: number; body: Record<string, any> }> {
  const res = await fetch(
    `https://app.pakasir.com/api/v2/create-transaction/${encodeURIComponent(slug)}/${encodeURIComponent(orderId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({ method: 'qris', amount: Number(amount) }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { ok: res.ok, status: res.status, body };
}

// Pengganti fetch transactioncreate/qris v1: mengembalikan objek mirip Response
// dengan json() berbentuk lama { payment: { payment_number, total_payment, expired_at } }.
export async function pakasirCreateQrisCompat(slug: string, orderId: string, amount: number, apiKey: string) {
  const r = await pakasirV2Create(apiKey, slug, orderId, amount);
  const b = r.body || {};
  const payment = {
    payment_number: String(b.qr_string || b.payment_number || ''),
    total_payment: Number(b.total_payment || amount),
    expired_at: String(b.expired_at || ''),
    txn_id: String(b.txn_id || ''),
    fee: b.fee,
  };
  return { ok: r.ok && !!payment.payment_number, status: r.status, json: async () => ({ ...b, payment, transaction: payment }) };
}

async function verifyV2(apiKey: string, slug: string, orderId: string, amt: number, timeoutMs: number): Promise<PakasirVerifyResult> {
  let txnId = '';
  try {
    const c = await pakasirV2Create(apiKey, slug, orderId, amt, timeoutMs);
    if (!c.ok) return { paid: false, status: 'unreachable', detail: `create_http_${c.status}:${JSON.stringify(c.body).slice(0, 150)}` };
    txnId = String(c.body?.txn_id || '');
  } catch (e) {
    return { paid: false, status: 'unreachable', detail: String(e) };
  }
  if (!txnId) return { paid: false, status: 'not_found', detail: 'no_txn_id' };
  let res: Response; let body: Record<string, any> = {};
  try {
    res = await fetch(`https://app.pakasir.com/api/v2/transaction-status/${encodeURIComponent(slug)}/${encodeURIComponent(txnId)}`, {
      headers: { 'X-Api-Key': apiKey }, signal: AbortSignal.timeout(timeoutMs),
    });
    body = (await res.json().catch(() => ({}))) as Record<string, any>;
  } catch (e) {
    return { paid: false, status: 'unreachable', detail: String(e) };
  }
  if (!res.ok) return { paid: false, status: 'unreachable', detail: `status_http_${res.status}` };
  const status = String(body.status || '').toLowerCase();
  if (!status) return { paid: false, status: 'not_found' };
  if (!PAID_STATUSES.has(status)) return { paid: false, status };
  if (body.is_sandbox === true) return { paid: false, status: 'sandbox', detail: 'sandbox_transaction' };
  if (body.order_id && String(body.order_id) !== orderId) return { paid: false, status: 'mismatch', detail: 'order_id_mismatch' };
  if (body.amount !== undefined && Number(body.amount) !== amt) {
    return { paid: false, status: 'mismatch', detail: `amount_mismatch:${body.amount}!=${amt}` };
  }
  return { paid: true, status };
}
