import { describe, it, expect } from 'vitest';
import { isMaintenanceHere, maintenanceKey } from './maintenance';

describe('mode perbaikan per website', () => {
  it('saklar Website B tidak menutup Website A', () => {
    const s = { [maintenanceKey('realtim48show.my.id')]: 'true' };
    expect(isMaintenanceHere(s, 'www.realtim48show.my.id')).toBe(true);
    expect(isMaintenanceHere(s, 'realtime48show.my.id')).toBe(false);
  });
  it('saklar lama hanya berlaku di website asalnya', () => {
    const s = { maintenance_mode: 'true', maintenance_origin: 'https://realtime48show.my.id' };
    expect(isMaintenanceHere(s, 'realtime48show.my.id')).toBe(true);
    expect(isMaintenanceHere(s, 'realtim48show.my.id')).toBe(false);
  });
  it('saklar lama tanpa asal tidak menutup semua website', () => {
    expect(isMaintenanceHere({ maintenance_mode: 'true' }, 'realtime48show.my.id')).toBe(false);
  });
});
