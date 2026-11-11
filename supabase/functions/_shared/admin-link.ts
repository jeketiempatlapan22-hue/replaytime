import { resolveGroupLink } from './group-link.ts';
import { createBundleLink } from './bundle.ts';
import { genShortPassword } from './membership-password.ts';
// Pembuatan link token admin bersama: dipakai admin-create-link (panel) dan bot Telegram admin.

export type AdminLinkResult = { status: number; body: any };
const out = (body: any, status = 200): AdminLinkResult => ({ status, body });
function newToken(len = 40) { return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, len); }
function rnd(len: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(len))).map((b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 36]).join('');
}
const fmtId = (d: Date) => d.toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

// deno-lint-ignore no-explicit-any
export async function createAdminLink(admin: any, body: { kind?: string; target_id?: string; label?: string; days?: number }, source = 'admin'): Promise<AdminLinkResult> {
  const kind = ['show', 'replay', 'membership', 'bundle'].includes(body.kind) ? body.kind : null;
  const targetId = String(body.target_id || '');
  const label = String(body.label || '').slice(0, 80) || 'admin';
  if (!kind) return out({ error: 'missing_fields' }, 400);

  const { data: settings } = await admin.from('site_settings').select('key,value').in('key', ['site_origin']);
  const origin = String(settings?.[0]?.value || 'https://realtime48show.my.id').replace(/\/+$/, '');
  const siteOnly = origin.replace(/^https?:\/\//, '');

  if (kind === 'bundle') {
    const r = await createBundleLink(admin, { label: `admin:${label}`, origin });
    if (!('ok' in r)) return out({ error: r.error }, 400);
    await admin.from('token_deliveries').insert({ phone: '', replay_id: null, replay_title: `Bundel • ${r.title}`, access_token: r.token, link: r.link, source, requested_by: source });
    return out({ ok: true, token: r.token, password: r.password, link: r.link, message: r.message, title: r.title, expires_at: null });
  }

  if (kind === 'membership') {
    const days = body.days === 62 ? 62 : 31;
    let token = rnd(12);
    for (let i = 0; i < 5; i++) {
      const { data } = await admin.from('membership_tokens').select('id').eq('token', token).maybeSingle();
      if (!data) break; token = rnd(12);
    }
    const password = genShortPassword();
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + days * 86400000);
    const name = days === 62 ? 'Membership 2 Bulan' : 'Membership 1 Bulan';
    const { data: tk, error } = await admin.from('membership_tokens').insert({
      token, password, phone: '', label: `admin:${label} / ${name}`, duration_days: days,
      starts_at: startsAt.toISOString(), expires_at: expiresAt.toISOString(), max_devices: 1,
      includes_replays: true, replay_info: '', package_id: null, created_by: 'admin', password_rotating: false,
    }).select('id').maybeSingle();
    if (error || !tk) return out({ error: 'create_failed', detail: error?.message }, 500);
    await admin.from('membership_token_passwords').insert({ token_id: tk.id, password });
    const link = `${origin}/live?mtoken=${encodeURIComponent(token)}&mp=${encodeURIComponent(password)}`;
    const message = [`👑 *MEMBERSHIP AKTIF*`, '', `📦 *${name}*`, `📅 Berlaku hingga: ${fmtId(expiresAt)}`, '',
      '🔗 *Link Akses:*', link, '', '🎬 *Link Replay:* ' + siteOnly, '', `🔐 Sandi: *${password}*`, '', '— *ReplayTime* 💖'].join('\n');
    await admin.from('token_deliveries').insert({ phone: '', replay_id: null, replay_title: `Membership • ${name}`, access_token: token, link, source, requested_by: source });
    return out({ ok: true, token, password, link, message, title: name, expires_at: expiresAt.toISOString() });
  }

  if (!targetId) return out({ error: 'missing_fields' }, 400);
  const token = newToken();

  if (kind === 'replay') {
    const { data: r } = await admin.from('replays').select('id,title,date,password').eq('id', targetId).maybeSingle();
    if (!r) return out({ error: 'replay_not_found' }, 404);
    const expiresAt = new Date(Date.now() + 365 * 86400000);
    const { error } = await admin.from('replay_personal_tokens').insert({ replay_id: r.id, token, label: `admin:${label}`, max_devices: 1, expires_at: expiresAt.toISOString() });
    if (error) return out({ error: 'create_failed', detail: error.message }, 500);
    const link = `${origin}/akses?token=${token}&replay=${r.id}`;
    const message = ['🎬 *ReplayTime*', '', `🎤 *${r.title}*`, r.date ? `📅 ${r.date}` : '', '', '🔗 *Link Akses*', link,
      r.password ? `\n🔐 Sandi: *${r.password}*` : '', `\n⏳ Berlaku sampai: *${fmtId(expiresAt)}*`, '', '✨ Selamat menonton! 💖'].join('\n');
    await admin.from('token_deliveries').insert({ phone: '', replay_id: r.id, replay_title: r.title, access_token: token, link, source, requested_by: source });
    return out({ ok: true, token, link, message, title: r.title, expires_at: expiresAt.toISOString() });
  }

  const { data: s } = await admin.from('active_shows').select('id,title,show_date,show_time,live_password,replay_info,replay_id,group_link,group_link_enabled').eq('id', targetId).maybeSingle();
  if (!s) return out({ error: 'show_not_found' }, 404);
  let replayPassword = String(s.live_password || '');
  if (!replayPassword && s.replay_id) {
    const { data: replay } = await admin.from('replays').select('password').eq('id', s.replay_id).maybeSingle();
    replayPassword = String(replay?.password || '');
  }
  const showStart = new Date(`${s.show_date}T${String(s.show_time).slice(0, 8)}+07:00`);
  const expiresAt = new Date(showStart.getTime() + 24 * 3600000);
  const { error } = await admin.from('active_show_tokens').insert({ show_id: s.id, token, kind: 'personal', max_devices: 1, label: `admin:${label}`, expires_at: expiresAt.toISOString() });
  if (error) return out({ error: 'create_failed', detail: error.message }, 500);
  const link = `${origin}/live?show=${s.id}&t=${token}`;
  const message = ['🔐 *TOKEN LIVE*', '', `🎤 *${s.title}*`, `📅 ${s.show_date} ${String(s.show_time).slice(0, 5)}`, `⏳ Berlaku sampai: *${fmtId(expiresAt)}*`, '',
    '🔗 *Link Live:*', link, '', '🎬 *Link Replay:*', siteOnly, ...(replayPassword ? ['', `🔐 Sandi Replay: *${replayPassword}*`] : []), ...(s.group_link_enabled && resolveGroupLink(s.group_link) ? ['', '👥 *Gabung Grup:*', resolveGroupLink(s.group_link)] : []), ...(s.replay_info ? ['', '🎞️ *Info Replay*', s.replay_info] : []), '', '— *ReplayTime* 💖'].join('\n');
  await admin.from('token_deliveries').insert({ phone: '', replay_id: null, replay_title: s.title, access_token: token, link, source, requested_by: source });
  return out({ ok: true, token, link, message, password: replayPassword, replay_info: s.replay_info || '', title: s.title, expires_at: expiresAt.toISOString() });
}
