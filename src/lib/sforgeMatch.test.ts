import { describe, it, expect } from 'vitest';
import { matchSforge } from '../../supabase/functions/_shared/sforge';

const list = [
  { job_name: 'pajama-drive-2026-11-05-261030191159', master: 'm1', master_final: 'f1', vod_ready: false },
  { job_name: 'itadakilove-2026-11-06-261030191656', master: 'm2', master_final: 'f2', vod_ready: false },
];

describe('SForge matching', () => {
  it('matches by title and date', () => {
    expect(matchSforge({ title: 'Pajama Drive', show_date: '2026-11-05' }, list)?.master).toBe('m1');
  });
  it('does not match a different date', () => {
    expect(matchSforge({ title: 'Pajama Drive', show_date: '2026-11-07' }, list)).toBeNull();
  });
});
