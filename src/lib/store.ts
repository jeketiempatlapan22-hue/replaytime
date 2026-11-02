import { slugifyName, type GalleryItem } from '@/lib/showImageMatch';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { compressImage } from '@/lib/imageUrl';

export type ReplayRow = Tables<'replays'>;
export type MasterPasswordRow = Tables<'master_passwords'>;
export type SiteSettingRow = Tables<'site_settings'>;

export async function getReplays(): Promise<ReplayRow[]> {
  // SECURITY: never expose youtube_id, m3u8_url, password to public client.
  // Source video is fetched on-demand via the `get-replay-source` edge function
  // after the user enters the correct password.
  const { data, error } = await supabase
    .from('replays')
    .select('id, title, show_name, date, criteria, featured_member, lineup, image_url, view_count, show_time, created_at, updated_at, source_type, price_coins, price_idr, image_fit, short_title')
    .eq('is_offline', false)
    .order('date', { ascending: false })
    .order('show_time', { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as ReplayRow[];
}

// Admin-only: returns all columns including secrets via SECURITY DEFINER RPC.
// Sensitive columns are revoked from anon/authenticated, so a direct table
// SELECT would not return them. The RPC enforces admin role server-side.
export async function getReplaysAdmin(): Promise<ReplayRow[]> {
  const { data, error } = await (supabase as any).rpc('admin_get_replays');
  if (error) throw error;
  return (data || []) as unknown as ReplayRow[];
}

export type PlaylistSourceType = 'youtube' | 'm3u8' | 'cloudflare';

export interface PlaylistSource {
  id: string;
  label: string;
  type: PlaylistSourceType;
  url: string;
  is_default?: boolean;
}

export interface ReplaySource {
  youtube_id: string;
  youtube_alt_id: string;
  m3u8_url: string;
  source_type: string;
  sources: PlaylistSource[];
}

// supabase-js mengembalikan `error` (bukan data) untuk respons non-2xx dari
// edge function, sehingga body JSON (`reason`) hilang. Helper ini membaca
// kembali body respons agar alasan gagal (device_limit / expired / dll) tetap terbaca.
async function readFunctionErrorBody(error: unknown): Promise<any | null> {
  try {
    const res = (error as { context?: Response })?.context;
    if (res && typeof (res as Response).json === 'function') {
      return await (res as Response).clone().json();
    }
  } catch { /* ignore */ }
  return null;
}

// Sandi membership per user yang diketik di player/kartu: simpan kredensialnya di
// perangkat agar live & replay lain langsung terbuka tanpa mengetik sandi lagi.
function rememberMembership(m: any) {
  if (!m?.token) return;
  void import('@/lib/membershipAccess').then(({ saveMembershipCredentials }) => {
    saveMembershipCredentials(String(m.token), String(m.password || ''));
  }).catch(() => undefined);
}

export async function getReplaySource(
  replayId: string,
  opts: { password?: string; accessToken?: string },
): Promise<{ data: ReplaySource | null; reason?: string }> {
  try {
    const body: Record<string, string> = { replay_id: replayId };
    if (opts.password) body.password = opts.password;
    if (opts.accessToken) {
      body.access_token = opts.accessToken;
      try {
        const { getBrowserId } = await import('@/lib/browserId');
        body.browser_id = getBrowserId();
      } catch { /* ignore */ }
    }
    const { data, error } = await supabase.functions.invoke('get-replay-source', { body });
    if (error) {
      const errBody = await readFunctionErrorBody(error);
      rememberMembership(errBody?.membership);
      return { data: null, reason: errBody?.reason };
    }
    rememberMembership(data?.membership);
    if (!data?.valid) return { data: null, reason: data?.reason };
    return {
      data: {
        youtube_id: data.youtube_id || '',
        youtube_alt_id: data.youtube_alt_id || '',
        m3u8_url: data.m3u8_url || '',
        source_type: data.source_type || 'youtube',
        sources: Array.isArray(data.sources) ? data.sources : [],
      },
    };
  } catch {
    return { data: null };
  }
}


export async function setReplayAccessToken(id: string, token: string | null) {
  const { error } = await supabase.from('replays').update({ access_token: token } as any).eq('id', id);
  if (error) throw error;
}

export async function getReplaysByMonth(): Promise<Record<string, ReplayRow[]>> {
  const replays = await getReplays();
  const grouped: Record<string, ReplayRow[]> = {};
  for (const r of replays) {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }
  return grouped;
}

export async function addReplay(replay: {
  title: string; show_name: string; date: string; criteria: string;
  featured_member: string; lineup: string[];
  password: string; youtube_id: string; image_url: string;
  source_type?: string; m3u8_url?: string; show_time?: string;
  admin_alias?: string; sources?: any; price_coins?: number; price_idr?: number; image_fit?: string;
}) {
  const { error } = await supabase.from('replays').insert(replay);
  if (error) throw error;
}

export async function updateReplay(id: string, updated: Partial<ReplayRow>) {
  const { error } = await supabase.from('replays').update(updated).eq('id', id);
  if (error) throw error;
}

export async function deleteReplay(id: string) {
  const { error } = await supabase.from('replays').delete().eq('id', id);
  if (error) throw error;
}

export async function getAllMasterPasswords(): Promise<MasterPasswordRow[]> {
  const { data, error } = await supabase.from('master_passwords').select('*');
  if (error) throw error;
  return data || [];
}

export async function setMasterPassword(month: string, password: string) {
  // Beberapa sandi master per bulan diizinkan — selalu tambah baris baru.
  const { error } = await supabase.from('master_passwords').insert({ month, password });
  if (error) throw error;
}

export async function setMasterPasswordPaused(id: string, paused: boolean) {
  const { error } = await supabase.from('master_passwords').update({ paused }).eq('id', id);
  if (error) throw error;
}

export async function deleteMasterPassword(id: string) {
  const { error } = await supabase.from('master_passwords').delete().eq('id', id);
  if (error) throw error;
}

export async function verifyPasswordDetailed(
  replayId: string,
  password: string,
): Promise<{ valid: boolean; reason?: string; seconds_remaining?: number }> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-password', {
      body: { replay_id: replayId, password },
    });
    if (error) {
      const body = await readFunctionErrorBody(error);
      rememberMembership(body?.membership);
      return { valid: false, reason: body?.reason, seconds_remaining: body?.seconds_remaining };
    }
    rememberMembership(data?.membership);
    return { valid: data?.valid === true, reason: data?.reason };
  } catch {
    return { valid: false };
  }
}

export async function verifyPassword(replayId: string, password: string): Promise<boolean> {
  return (await verifyPasswordDetailed(replayId, password)).valid;
}


export async function getSetting(key: string): Promise<string> {
  const { data } = await supabase.from('site_settings').select('value').eq('key', key).maybeSingle();
  return data?.value || '';
}

export async function getSettings(): Promise<Record<string, string>> {
  const { data } = await supabase.from('site_settings').select('*');
  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value;
  return map;
}

export async function setSetting(key: string, value: string) {
  const { data: existing } = await supabase.from('site_settings').select('id').eq('key', key).maybeSingle();
  if (existing) {
    const { error } = await supabase.from('site_settings').update({ value }).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('site_settings').insert({ key, value });
    if (error) throw error;
  }
}


export async function uploadImage(file: File, name?: string): Promise<string> {
  const compressed = await compressImage(file, 0, 0.75);
  const ext = compressed.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'jpg');
  // Nama gambar dipakai untuk pencocokan otomatis logo kartu show.
  const base = name && name.trim()
    ? slugifyName(name)
    : slugifyName(file.name.replace(/\.[^.]+$/, '')) || crypto.randomUUID();
  let fileName = `${base}.${ext}`;
  let { error } = await supabase.storage.from('card-images').upload(fileName, compressed, { contentType: compressed.type });
  if (error) {
    fileName = `${base}-${Date.now().toString(36)}.${ext}`;
    const retry = await supabase.storage.from('card-images').upload(fileName, compressed, { contentType: compressed.type });
    if (retry.error) throw retry.error;
  }
  const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
  return data.publicUrl;
}

export async function getGalleryItems(): Promise<GalleryItem[]> {
  const { data, error } = await supabase.storage.from('card-images').list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return (data || [])
    .filter(f => f.name !== '.emptyFolderPlaceholder')
    .map(f => ({
      file: f.name,
      name: f.name.replace(/\.[^.]+$/, ''),
      url: supabase.storage.from('card-images').getPublicUrl(f.name).data.publicUrl,
    }));
}

export async function getGalleryImages(): Promise<string[]> {
  const { data, error } = await supabase.storage.from('card-images').list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return (data || [])
    .filter(f => f.name !== '.emptyFolderPlaceholder')
    .map(f => supabase.storage.from('card-images').getPublicUrl(f.name).data.publicUrl);
}

/**
 * Ganti nama file gambar galeri tanpa upload ulang.
 * Semua show/replay yang memakai gambar lama otomatis diarahkan ke URL baru.
 */
export async function renameGalleryImage(file: string, newName: string): Promise<string> {
  const ext = (file.split('.').pop() || 'jpg').toLowerCase();
  const base = slugifyName(newName);
  if (!base) throw new Error('Nama tidak boleh kosong');
  let target = `${base}.${ext}`;
  const oldUrl = supabase.storage.from('card-images').getPublicUrl(file).data.publicUrl;
  if (target === file) return oldUrl;
  let { error } = await supabase.storage.from('card-images').move(file, target);
  if (error) {
    target = `${base}-${Date.now().toString(36)}.${ext}`;
    const retry = await supabase.storage.from('card-images').move(file, target);
    if (retry.error) throw retry.error;
  }
  const url = supabase.storage.from('card-images').getPublicUrl(target).data.publicUrl;
  await supabase.from('active_shows').update({ image_url: url }).eq('image_url', oldUrl);
  await supabase.from('replays').update({ image_url: url }).eq('image_url', oldUrl);
  return url;
}

/** Hapus gambar galeri (file storage). */
export async function deleteGalleryImage(file: string): Promise<void> {
  const { error } = await supabase.storage.from('card-images').remove([file]);
  if (error) throw error;
}
