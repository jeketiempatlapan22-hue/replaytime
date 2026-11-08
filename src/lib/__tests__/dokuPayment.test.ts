import { describe, expect, it } from 'vitest';
import { inspectDokuPayment, dokuInvoiceReusable } from '../../../supabase/functions/_shared/doku-rules';

const paid = { responseCode: '2005100', latestTransactionStatus: '00', originalPartnerReferenceNo: 'dkshow1', originalReferenceNo: 'reference1', amount: { value: '2000.00', currency: 'IDR' } };
describe('DOKU-only verified payments', () => {
  it('unlocks only a successful exact DOKU payment', () => { expect(inspectDokuPayment(paid, 'dkshow1', 'reference1', 2000)).toEqual({ paid: true, status: 'paid' }); });
  it('does not unlock pending QRIS', () => { expect(inspectDokuPayment({ ...paid, latestTransactionStatus: '03' }, 'dkshow1', 'reference1', 2000).paid).toBe(false); });
  it('rejects a different invoice', () => { expect(inspectDokuPayment(paid, 'dkshow2', 'reference1', 2000).paid).toBe(false); });
  it('rejects a different reference', () => { expect(inspectDokuPayment(paid, 'dkshow1', 'reference2', 2000).paid).toBe(false); });
  it('rejects a different amount', () => { expect(inspectDokuPayment(paid, 'dkshow1', 'reference1', 5000).paid).toBe(false); });
  it('rejects missing amount and wrong currency', () => {
    expect(inspectDokuPayment({ ...paid, amount: undefined }, 'dkshow1', 'reference1', 2000).paid).toBe(false);
    expect(inspectDokuPayment({ ...paid, amount: { value: '2000.00', currency: 'USD' } }, 'dkshow1', 'reference1', 2000).paid).toBe(false);
  });
  it('does not reuse a QR after expiry, price change or environment change', () => {
    const row = { amount: 2000, environment: 'production', qr_content: 'qr-fixture', expires_at: '2026-11-09T01:00:00Z' };
    expect(dokuInvoiceReusable(row, 2000, 'production', Date.parse('2026-11-09T00:00:00Z'))).toBe(true);
    expect(dokuInvoiceReusable(row, 2000, 'production', Date.parse(row.expires_at))).toBe(false);
    expect(dokuInvoiceReusable(row, 5000, 'production', Date.parse('2026-11-09T00:00:00Z'))).toBe(false);
    expect(dokuInvoiceReusable(row, 2000, 'sandbox', Date.parse('2026-11-09T00:00:00Z'))).toBe(false);
  });
});