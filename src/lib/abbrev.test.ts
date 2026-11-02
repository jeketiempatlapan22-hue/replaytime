import { describe, it, expect } from 'vitest';
import { abbreviateTitle, displayShortTitle } from './abbrev';

describe('abbreviateTitle', () => {
  it('Pajama Drive → PJMD', () => expect(abbreviateTitle('Pajama Drive')).toBe('PJMD'));
  it('Cara Meminum Ramune → CRM', () => expect(abbreviateTitle('Cara Meminum Ramune')).toBe('CRM'));
  it('admin override wins', () => expect(displayShortTitle({ title: 'Pajama Drive', short_title: 'PD' })).toBe('PD'));
});
