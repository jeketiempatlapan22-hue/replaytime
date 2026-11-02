import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyToClipboard } from './clipboard';

afterEach(() => vi.restoreAllMocks());
describe('complete access text copying', () => {
  it('copies the entire token link and replay information', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const text = 'https://realtime48show.my.id/live?show=show-id&t=abcdefghijklmnopqrstuvwxyz0123456789\nInfo Replay: tersedia besok';
    expect(await copyToClipboard(text)).toBe(true);
    expect(writeText).toHaveBeenCalledWith(text);
  });
  it('does not report success when both copy methods are refused', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });
    expect(await copyToClipboard('full-token')).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});