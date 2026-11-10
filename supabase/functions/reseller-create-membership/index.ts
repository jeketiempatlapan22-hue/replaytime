import { resolveGroupLink, appendGroupLink } from '../_shared/group-link.ts';
import { primeReplayHost, rewriteReplay } from '../_shared/replay-origin.ts';
import { genShortPassword } from '../_shared/membership-password.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => _json(b && typeof (b as any).message === 'string' ? { ...(b as any), message: rewriteReplay((b as any).message) } : b, s);
const _json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}
function rnd(len: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map((b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 36]).join('');
}
async function freshToken(admin: any, len: number) {
  for (let i = 0; i < 8; i++) {
    const token = rnd(len);
    const { data } = await admin.from('membership_tokens').select('id').eq('token', token).maybeSingle();
    if (!data) return token;
  }
  return `${rnd(len)}${Date.now().toString(36).toUpperCase()}`;
}

const DEFAULT_TPL =
  '👑 *MEMBERSHIP AKTIF*\n\n📦 *{package_name}*\n📅 Berlaku hingga: {expires_at}\n\n🔗 *Link Akses:*\n{link}\n\n🎬 *Link Replay:* realtime48show.my.id\n\n{replay_info_block}👤 Berlaku untuk *{max_devices} perangkat*.\n\n— *ReplayTime* 💖';

function build(tpl: string, v: Record<string, string>) {
  return tpl
    .replace(/\{package_name\}/g, v.package_name || '')
    .replace(/\{link\}/g, v.link || '')
    .replace(/\{password\}/g, v.password || '')
    .replace(/\{expires_at\}/g, v.expires_at || '')
    .replace(/\{duration_days\}/g, v.duration_days || '')
    .replace(/\{max_devices\}/g, v.max_devices || '1')
    .replace(/\{replay_info\}/g, v.replay_info || '')
    .replace(/\{replay_info_block\}/g, v.replay_info ? `🎬 *Info Replay:*\n${v.replay_info}\n\n` : '')
    .replace(/\{site\}/g, v.site || '');
}

Deno.serve(async (req) => {
  await primeReplayHost();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const phone = normalizePhone(body.phone || '');
  const pin = String(body.pin || '').trim();
  const packageId = String(body.package_id || '');
  if (!phone || !pin || !packageId) return json({ error: 'missing_fields' }, 400);

  const { data: verified } = await admin.rpc('reseller_verify', { _phone: phone, _pin: pin });
  if (verified !== true) return json({ error: 'unauthorized' }, 401);

  const preset = packageId === 'preset_1m' ? 31 : packageId === 'preset_2m' ? 62 : 0;
  let pkg: any = null;
  if (preset) {
    pkg = { id: null, name: preset === 62 ? 'Membership 2 Bulan' : 'Membership 1 Bulan', paused: false, max_devices: 1, includes_replays: true, replay_info: '', duration_days: preset, fixed_expires_at: null };
    const { data: ri } = await admin.from('site_settings').select('value').eq('key', 'reseller_membership_replay_info').maybeSingle();
    pkg.replay_info = String(ri?.value || '');
  } else {
    const { data } = await admin.from('membership_packages')
      .select('id,name,status,paused,max_devices,includes_replays,replay_info,group_link,duration_days,fixed_starts_at,fixed_expires_at').eq('id', packageId).maybeSingle();
    pkg = data;
  }
  if (!pkg) return json({ error: 'package_not_found' }, 404);
  if (pkg.paused === true) return json({ error: 'package_paused' }, 400);

  // Token reseller SELALU fixed: 31 hari (1 bulan) atau 62 hari (2 bulan) sejak pembuatan.
  // Tidak terpengaruh durasi/periode tetap yang diatur admin.
  const pkgName = String(pkg.name || '').toLowerCase();
  const adminDays = Math.floor(Number(pkg.duration_days) || 30);
  const isTwoMonths = /\b2\s*bulan|dua\s*bulan|60\s*hari|62\s*hari/.test(pkgName) || adminDays >= 45;
  const days = preset || (isTwoMonths ? 62 : 31);

  const { data: settings } = await admin.from('site_settings').select('key,value')
    .in('key', ['site_origin', 'wa_membership_template']);
  const sm = new Map((settings ?? []).map((x: any) => [x.key, x.value]));
  const origin = ((sm.get('site_origin') as string) || 'https://realtime48show.my.id').replace(/\/+$/, '');
  const tpl = (sm.get('wa_membership_template') as string) || DEFAULT_TPL;
  // Info replay reseller = info replay paket yang diatur admin (disatukan).
  const replayInfo = String(pkg.replay_info || '');

  const groupOverride = body.group_mode === 'none' ? '' : body.group_mode === 'custom' ? resolveGroupLink(body.group_link) : null;
  if (body.group_mode === 'custom' && !groupOverride) return json({ error: 'invalid_group_link' }, 400);
  const groupLink = resolveGroupLink(pkg.group_link, groupOverride);

  const token = await freshToken(admin, 12);
  const password = genShortPassword();
  // Periode dihitung dari waktu pembuatan token reseller (31/62 hari).
  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);
  const effectiveDays = days;

  const { data: ba } = await admin.from('bot_admins').select('label').eq('phone', phone).maybeSingle();
  const resellerLabel = (ba?.label || '').trim();

  const { data: tk, error } = await admin.from('membership_tokens').insert({
    token, password, phone,
    label: `reseller:${phone} / ${pkg.name}`,
    duration_days: effectiveDays,
    starts_at: startsAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    max_devices: pkg.max_devices || 1,
    includes_replays: pkg.includes_replays !== false,
    replay_info: replayInfo,
    group_link_override: groupOverride,
    package_id: pkg.id,
    created_by: `reseller:${phone}`,
    password_rotating: false,
  }).select('id').maybeSingle();
  if (error || !tk) return json({ error: 'create_failed', detail: error?.message }, 500);

  await admin.from('membership_token_passwords').insert({ token_id: tk.id, password });

  const link = `${origin}/live?mtoken=${encodeURIComponent(token)}&mp=${encodeURIComponent(password)}`;
  const expStr = expiresAt.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const siteOnly = origin.replace(/^https?:\/\//, '');
  const message = ['👑 *MEMBERSHIP AKTIF*', '', `📦 *${pkg.name}*`, `📅 Berlaku hingga: ${expStr}`, '',
    '🔗 *Link Akses:*', link, '', '🎬 *Link Replay:* ' + siteOnly, '', `🔐 Sandi: *${password}*`, ...(groupLink ? ['', '👥 *Gabung Grup:*', groupLink] : []), '', '— *ReplayTime* 💖'].join('\n');

  await admin.from('token_deliveries').insert({
    phone, replay_id: null, replay_title: `Membership • ${pkg.name}`,
    access_token: token, link, source: 'bot', requested_by: phone,
  });
  await admin.from('reseller_audit_log').insert({
    reseller_phone: phone, reseller_label: resellerLabel,
    kind: 'membership', target_id: pkg.id || null, target_title: pkg.name,
    token, expires_at: expiresAt.toISOString(), duration_days: effectiveDays,
    meta: { max_devices: pkg.max_devices || 1, includes_replays: pkg.includes_replays !== false, replay_info_source: 'package', fixed_period: !!pkg.fixed_expires_at },
  });

  return json({
    ok: true, token, password, link, message,
    title: pkg.name, expires_at: expiresAt.toISOString(), duration_days: effectiveDays,
  });
});
