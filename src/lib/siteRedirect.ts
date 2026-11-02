// Pengalihan penuh Website A → Website B (live & replay) beserta kredensial penonton.
// Data pembelian disimpan per-domain di HP, jadi saat pindah domain token/sandi
// harus ikut dibawa lewat alamat; di tujuan alamat langsung dibersihkan.
import { supabase } from '@/integrations/supabase/client';
import { readMembershipCredentials } from '@/lib/membershipAccess';
import { getShowPurchase, getReplayPurchase } from '@/lib/purchases';

export interface SiteRouting {
  live_origin: string;
  replay_origin: string;
  main_origin: string;
  replay_path: string;
  hide_youtube_on_main: boolean;
  compact_replay_cards: boolean;
}

export const cleanOrigin = (v: unknown) => {
  const raw = String(v || '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+$/i.test(raw) ? raw.toLowerCase() : '';
};
export const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');

const KEYS = ['live_origin', 'replay_origin', 'main_origin', 'replay_path', 'hide_youtube_on_main', 'compact_replay_cards'];
let cache: { at: number; p: Promise<SiteRouting> } | null = null;

export function parseRouting(rows: { key: string; value: string }[]): SiteRouting {
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    live_origin: cleanOrigin(m.live_origin),
    replay_origin: cleanOrigin(m.replay_origin),
    main_origin: cleanOrigin(m.main_origin),
    replay_path: String(m.replay_path || 'rply').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'rply',
    hide_youtube_on_main: m.hide_youtube_on_main === 'true',
    compact_replay_cards: m.compact_replay_cards === 'true',
  };
}

export function getSiteRouting(force = false): Promise<SiteRouting> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.p;
  const p = (async () => {
    const { data } = await supabase.from('site_settings').select('key,value').in('key', KEYS);
    return parseRouting((data || []) as any);
  })().catch(() => parseRouting([]));
  cache = { at: Date.now(), p };
  return p;
}

/** Pengalihan tidak berlaku di preview/lokal. */
export function redirectsDisabled(hostname = window.location.hostname) {
  return /^(localhost|127\.)/.test(hostname) || hostname.endsWith('lovable.app');
}

/** Origin tujuan jika berbeda dengan website saat ini, selain itu ''. */
export function crossTarget(origin: string, currentHost = window.location.host): string {
  if (!origin) return '';
  try { return bareHost(new URL(origin).host) !== bareHost(currentHost) ? origin : ''; } catch { return ''; }
}

const HANDOFF_PW = 'rt-handoff-pw';
export function stashLivePassword(pw: string) { try { sessionStorage.setItem(HANDOFF_PW, pw); } catch { /* ignore */ } }

/** Tambahkan kredensial tersimpan ke query /live sebelum pindah domain. */
export function withLiveCredentials(search: string): string {
  const sp = new URLSearchParams(search);
  if (!sp.get('t') && !sp.get('mtoken') && !sp.get('pw')) {
    const show = sp.get('show') || '';
    const purchase = show ? getShowPurchase(show) : null;
    const mem = readMembershipCredentials();
    let pw = '';
    try { pw = sessionStorage.getItem(HANDOFF_PW) || ''; } catch { /* ignore */ }
    if (purchase?.token) sp.set('t', purchase.token);
    else if (mem?.token) { sp.set('mtoken', mem.token); if (mem.password) sp.set('mp', mem.password); }
    else if (pw) sp.set('pw', pw);
  }
  try { sessionStorage.removeItem(HANDOFF_PW); } catch { /* ignore */ }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** URL replay di Website B lengkap dengan token / sandi yang dimiliki di HP ini. */
export function buildReplayHandoff(origin: string, replayPath: string, replayId: string): string {
  const sp = new URLSearchParams({ replay: replayId });
  let tok = '', pw = '';
  try { tok = sessionStorage.getItem(`replaytime-tok-${replayId}`) || ''; pw = sessionStorage.getItem(`replaytime-pw-${replayId}`) || ''; } catch { /* ignore */ }
  const purchase = getReplayPurchase(replayId);
  if (!tok && purchase?.token) tok = purchase.token;
  if (!pw && purchase?.password) pw = purchase.password;
  if (!tok && !pw) { const mem = readMembershipCredentials(); if (mem?.token) tok = mem.token; }
  if (tok) sp.set('token', tok);
  else if (pw) sp.set('pw', pw);
  return `${origin}/${replayPath}?${sp.toString()}`;
}

/** Dipanggil tombol Tonton Replay: true jika penonton sedang dipindah ke Website B. */
export async function redirectReplayIfNeeded(replayId: string): Promise<boolean> {
  if (redirectsDisabled()) return false;
  const r = await getSiteRouting();
  const target = crossTarget(r.replay_origin);
  if (!target) return false;
  window.location.assign(buildReplayHandoff(target, r.replay_path, replayId));
  return true;
}

/** Pengaturan tampilan replay untuk website yang sedang dibuka. */
export function replayDisplayFlags(r: SiteRouting, currentHost = window.location.host) {
  const onReplaySite = !!r.replay_origin && !crossTarget(r.replay_origin, currentHost);
  const hideTitle = r.compact_replay_cards || (r.hide_youtube_on_main && !onReplaySite);
  return { compact: r.compact_replay_cards, hideTitle };
}
