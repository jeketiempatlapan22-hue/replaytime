import { describe, expect, it } from 'vitest';
import { samePassword, passwordMonths } from '../../../supabase/functions/_shared/password-rules';
import { keepMonitorLocal } from '../monitorRouting';

describe('password rules shared by live and replay', () => {
  it('accepts lowercase with trailing spaces for a six-character password', () => {
    expect(samePassword('AB2CD3', ' ab2cd3  ')).toBe(true);
    expect(samePassword('AB2CD3', 'AB2CD4')).toBe(false);
  });
  it('never treats an empty password as access', () => {
    expect(samePassword('', '  ')).toBe(false);
  });
  it('compares wildcard characters literally', () => {
    expect(samePassword('ABC123', '%')).toBe(false);
    expect(samePassword('ABC123', 'ABC12_')).toBe(false);
  });
  it('accepts the replay month and current WIB month across UTC month boundaries', () => {
    expect(passwordMonths('2026-10-15', Date.parse('2026-11-30T18:00:00Z'))).toEqual(['2026-10', '2026-12']);
  });
  it('deduplicates the content and current month', () => {
    expect(passwordMonths('2026-11-11', Date.parse('2026-11-11T12:19:00Z'))).toEqual(['2026-11']);
  });
});

describe('admin monitor routing', () => {
  it('keeps admin_monitor=1 on the current domain', () => {
    expect(keepMonitorLocal('?admin_monitor=1', false)).toBe(true);
    expect(keepMonitorLocal('?admin_monitor=0', false)).toBe(false);
  });
  it('keeps embedded pages local without exempting ordinary viewers', () => {
    expect(keepMonitorLocal('?show=123', true)).toBe(true);
    expect(keepMonitorLocal('?show=123', false)).toBe(false);
  });
});