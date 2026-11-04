import { describe, it, expect } from 'vitest';
import { parseServer2Url } from './bulkShowParser';

describe('parseServer2Url', () => {
  it('reads server2 line', () => {
    expect(parseServer2Url('server2: https://cdn.x/live.m3u8')).toBe('https://cdn.x/live.m3u8');
  });
  it('reads s2 shorthand', () => {
    expect(parseServer2Url('S2 = https://a.b/c.m3u8?x=1')).toBe('https://a.b/c.m3u8?x=1');
  });
  it('ignores other lines', () => {
    expect(parseServer2Url('idn: SHC980')).toBe('');
  });
});
