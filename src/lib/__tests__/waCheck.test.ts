import { describe, it, expect } from 'vitest';
import { waBlocksPurchase, waShowsAdminButton } from '../waCheck';
describe('wa check rules', () => {
  it('blocks unregistered numbers', () => expect(waBlocksPurchase('not_registered')).toBe(true));
  it('allows active numbers', () => expect(waBlocksPurchase('registered')).toBe(false));
  it('outage skips the check silently', () => { expect(waBlocksPurchase('unknown')).toBe(false); expect(waShowsAdminButton('unknown')).toBe(false); });
  it('unregistered offers admin', () => expect(waShowsAdminButton('not_registered')).toBe(true));
});
