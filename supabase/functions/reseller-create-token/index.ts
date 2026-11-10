import { resolveGroupLink, appendGroupLink } from '../_shared/group-link.ts';
import { primeReplayHost, rewriteReplay } from '../_shared/replay-origin.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createBundleLink } from '../_shared/bundle.ts';

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

function newToken(len = 40) {
  const a = crypto.randomUUID().replace(/-/g, '');
  const b = crypto.randomUUID().replace(/-/g, '');
  return (a + b).slice(0, len);
}

const DEFAULT_WA_TPL =
  '🎬 *ReplayTime*\n━━━━━━━━━━━━━━\n\n🎤 *{title}*\n{date_line}🔗 *Link Akses*\n{link}\n{password_line}━━━━━━━━━━━━━━\n✨ Selamat menonton! 💖';

function renderWaTemplate(tpl: string, v: { title: string; link: string; date?: string; password?: string; site?: string }) {
  return (tpl || DEFAULT_WA_TPL)
    .replace(/\{date_line\}/g, v.date ? `📅 ${v.date}\n\n` : '')
    .replace(/\{password_line\}/g, v.password ? `🔐 Sandi: *${v.password}*\n\n` : '')
    .replace(/\{live_link_block\}/g, '')
    .replace(/\{title\}/g, v.title || '')
    .replace(/\{link\}/g, v.link || '')
    .replace(/\{date\}/g, v.date || '')
    .replace(/\{password\}/g, v.password || '')
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
  const kind = body.kind === 'show' ? 'show' : body.kind === 'replay' ? 'replay' : body.kind === 'bundle' ? 'bundle' : null;
  const targetId = String(body.target_id || '');
  if (!phone || !pin || !kind || (!targetId && kind !== 'bundle')) return json({ error: 'missing_fields' }, 400);

  // Verifikasi reseller setiap request
  const { data: vrows } = await admin.rpc('reseller_verify', { _phone: phone, _pin: pin });
  if (vrows !== true) return json({ error: 'unauthorized' }, 401);

  const { data: settings } = await admin.from('site_settings').select('key,value');
  const map = new Map((settings ?? []).map((s: any) => [s.key, s.value]));
  const origin = ((map.get('site_origin') as string) || 'https://realtime48show.my.id').replace(/\/+$/, '');
  const siteOnly = origin.replace(/^https?:\/\//, '');
  const tpl = (map.get('wa_message_template') as string) || DEFAULT_WA_TPL;

  const token = newToken();
  const label = `reseller:${phone}`;

  const { data: ba } = await admin.from('bot_admins').select('label').eq('phone', phone).maybeSingle();
  const resellerLabel = (ba?.label || '').trim();

  const fmtId = (d: Date) => d.toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  });

  if (kind === 'bundle') {
    const r = await createBundleLink(admin, { label: `reseller:${phone}`, origin });
    if (!('ok' in r)) return json({ error: r.error }, 400);
    await admin.from('token_deliveries').insert({
      phone, replay_id: null, replay_title: `Bundel • ${r.title}`, access_token: r.token, link: r.link,
      source: 'bot', requested_by: phone,
    });
    await admin.from('reseller_audit_log').insert({
      reseller_phone: phone, reseller_label: resellerLabel,
      kind: 'show', target_id: null, target_title: `🎁 Bundel • ${r.title}`,
      token: r.token, expires_at: null, meta: { bundle: true, show_ids: r.show_ids },
    });
    return json({ ok: true, token: r.token, link: r.link, message: r.message, title: r.title, expires_at: null });
  }

  if (kind === 'replay') {
    const { data: r } = await admin.from('replays').select('id,title,date,password').eq('id', targetId).maybeSingle();
    if (!r) return json({ error: 'replay_not_found' }, 404);
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const { error } = await admin.from('replay_personal_tokens').insert({
      replay_id: r.id, token, label, max_devices: 1, expires_at: expiresAt.toISOString(),
    });
    if (error) return json({ error: 'create_failed', detail: error.message }, 500);

    const link = `${origin}/akses?token=${token}&replay=${r.id}`;
    const message = ['🎬 *ReplayTime*', '', `🎤 *${r.title}*`, r.date ? `📅 ${r.date}` : '', '', '🔗 *Link Akses*', link,
      r.password ? `\n🔐 Sandi: *${r.password}*` : '', `\n⏳ Berlaku sampai: *${fmtId(expiresAt)}*`, '', '✨ Selamat menonton! 💖'].join('\n');

    await admin.from('token_deliveries').insert({
      phone, replay_id: r.id, replay_title: r.title, access_token: token, link,
      source: 'bot', requested_by: phone,
    });
    await admin.from('reseller_audit_log').insert({
      reseller_phone: phone, reseller_label: resellerLabel,
      kind: 'replay', target_id: r.id, target_title: r.title,
      token, expires_at: expiresAt.toISOString(),
    });
    return json({ ok: true, token, link, message, title: r.title, expires_at: expiresAt.toISOString() });
  }

  // kind === 'show'
  const { data: s } = await admin.from('active_shows')
    .select('id,title,show_date,show_time,live_password,replay_info,replay_id,group_link,group_link_enabled').eq('id', targetId).maybeSingle();
  if (!s) return json({ error: 'show_not_found' }, 404);

  const groupOverride = body.group_mode === 'none' ? '' : body.group_mode === 'custom' ? resolveGroupLink(body.group_link) : null;
  if (body.group_mode === 'custom' && !groupOverride) return json({ error: 'invalid_group_link' }, 400);
  const groupLink = resolveGroupLink(s.group_link_enabled ? s.group_link : '', groupOverride);

  // expires_at = jadwal show + 8 jam (akhir window auto-schedule live, WIB +07:00)
  const showStart = new Date(`${s.show_date}T${String(s.show_time).slice(0, 8)}+07:00`);
  const expiresAt = new Date(showStart.getTime() + 24 * 60 * 60 * 1000);

  const { error } = await admin.from('active_show_tokens').insert({
    show_id: s.id, token, group_link_override: groupOverride, kind: 'personal', max_devices: 1, label, expires_at: expiresAt.toISOString(),
  });
  if (error) return json({ error: 'create_failed', detail: error.message }, 500);

  const link = `${origin}/live?show=${s.id}&t=${token}`;
  let replayPassword = String(s.live_password || '');
  if (!replayPassword && s.replay_id) {
    const { data: rp } = await admin.from('replays').select('password').eq('id', s.replay_id).maybeSingle();
    replayPassword = String(rp?.password || '');
  }
  const message = ['🔐 *TOKEN LIVE*', '', `🎤 *${s.title}*`, `📅 ${s.show_date} ${String(s.show_time).slice(0, 5)}`, `⏳ Berlaku sampai: *${fmtId(expiresAt)}*`, '',
    '🔗 *Link Live:*', link, '', '🎬 *Link Replay:*', siteOnly, ...(replayPassword ? ['', `🔐 Sandi Replay: *${replayPassword}*`] : []), ...(groupLink ? ['', '👥 *Gabung Grup:*', groupLink] : []), ...(s.replay_info ? ['', '🎞️ *Info Replay*', s.replay_info] : []), '', '— *ReplayTime* 💖'].join('\n');

  await admin.from('token_deliveries').insert({
    phone, replay_id: null, replay_title: s.title, access_token: token, link,
    source: 'bot', requested_by: phone,
  });
  await admin.from('reseller_audit_log').insert({
    reseller_phone: phone, reseller_label: resellerLabel,
    kind: 'show', target_id: s.id, target_title: s.title,
    token, expires_at: expiresAt.toISOString(),
  });
  return json({ ok: true, token, link, message, password: replayPassword, title: s.title, expires_at: expiresAt.toISOString() });
});
