// Path Replay Rahasia: baris "Link Replay" di semua pesan diarahkan ke
// realtime48show.my.id/<path> (site_settings.replay_path, default "rply").
// Halaman utama tetap di domain yang sama; hanya link replay yang memakai path ini.
import { createClient } from 'npm:@supabase/supabase-js@2';

const PRIMARY_RE = /(https?:\/\/)?(www\.)?realtimestream\.my\.id/g;
let cache: { path: string; link: string; at: number } | null = null;

function normHost(v: unknown): string {
  const h = String(v || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? h : '';
}

export function normalizePath(v: unknown): string {
  return String(v || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^[a-z0-9.-]+\//i, '') // buang host bila admin menulis URL penuh
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
}

export async function primeReplayHost(): Promise<string> {
  if (cache && Date.now() - cache.at < 60_000) return cache.path;
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data } = await sb.from('site_settings').select('key,value').in('key', ['replay_path', 'link_origin']);
    const m = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
    cache = { path: normalizePath(m.replay_path) || 'rply', link: normHost(m.link_origin), at: Date.now() };
  } catch {
    cache = { path: cache?.path || 'rply', link: cache?.link || '', at: Date.now() };
  }
  return cache.path;
}

/** Arahkan "Link Replay" ke realtime48show.my.id/<path> (hanya blok Link Replay). */
export function rewriteReplay(text: string, pathArg?: string): string {
  const path = pathArg ?? cache?.path ?? '';
  if (!text) return text;
  let out = text;
  if (path && /Link Replay/i.test(text)) out = rewriteReplayBlock(text, path);
  // Domain Link Pesan (site_settings.link_origin): ganti domain semua link di pesan.
  const link = cache?.link;
  if (link && link !== 'realtime48show.my.id') out = out.replace(PRIMARY_RE, (_m, scheme) => `${scheme ? 'https://' : ''}${link}`);
  return out;
}

function rewriteReplayBlock(text: string, path: string): string {
  return text.replace(/Link Replay[\s\S]*?(?=\n\s*\n|$)/gi, (seg) => {
    if (seg.includes(`realtime48show.my.id/${path}`)) return seg; // sudah diarahkan
    return seg.replace(PRIMARY_RE, (_m, scheme) => `${scheme ? 'https://' : ''}realtime48show.my.id/${path}`);
  });
}
