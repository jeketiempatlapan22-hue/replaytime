import { describe, it, expect } from 'vitest';
import { buildSources } from './YouTubePlayer';

describe('replay sources', () => {
  it('puts SForge Server 3 first as default, YouTube second', () => {
    const list = buildSources({ m3u8_url: 'https://x.sforge.my.id/a/master-final.m3u8', youtube_id: 'abc', sources: [] } as any, {} as any);
    expect(list.map(s => s.label)).toEqual(['Server 3', 'YouTube']);
    expect(list[0].is_default).toBe(true);
  });
});
