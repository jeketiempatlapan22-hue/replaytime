// Centralized token creation for both master public tokens and personal device-locked tokens.
// Always issues a FRESH token — never reuses an existing one.
// Auth: service-role bearer (called from other edge functions/bot) OR admin user via JWT claims.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function newToken(len = 40) {
  const a = crypto.randomUUID().replace(/-/g, '');
  const b = crypto.randomUUID().replace(/-/g, '');
  return (a + b).slice(0, len);
}

const DEFAULT_WA_TPL =
  '🎬 *ReplayTime*\n━━━━━━━━━━━━━━\n\n🎤 *{title}*\n{date_line}🔗 *Link Akses*\n{link}\n{password_line}{live_link_block}━━━━━━━━━━━━━━\n✨ Selamat menonton! 💖';

function renderWaTemplate(tpl: string, vars: {
  title: string; link: string; date?: string; password?: string; liveLink?: string; orderId?: string; site?: string;
}) {
  return (tpl || DEFAULT_WA_TPL)
    .replace(/\{date_line\}/g, vars.date ? `📅 ${vars.date}\n\n` : '')
    .replace(/\{password_line\}/g, vars.password ? `🔐 Sandi: *${vars.password}*\n\n` : '')
    .replace(/\{live_link_block\}/g, vars.liveLink ? `📺 *Link Live*\n${vars.liveLink}\n\n` : '')
    .replace(/\{title\}/g, vars.title || '')
    .replace(/\{link\}/g, vars.link || '')
    .replace(/\{date\}/g, vars.date || '')
    .replace(/\{password\}/g, vars.password || '')
    .replace(/\{live_link\}/g, vars.liveLink || '')
    .replace(/\{order_id\}/g, vars.orderId || '')
    .replace(/\{site\}/g, vars.site || '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // --- Authn: service role bearer OR admin JWT ---
  const authHeader = req.headers.get('Authorization') || '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '');
  let allowed = false;
  let actorPhone = '';
  if (bearer && bearer === SERVICE_ROLE) {
    allowed = true;
  } else if (bearer) {
    try {
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims } = await userClient.auth.getClaims(bearer);
      if (claims?.claims?.sub) {
        const { data: r } = await admin.from('user_roles')
          .select('role').eq('user_id', claims.claims.sub).eq('role', 'admin').maybeSingle();
        allowed = !!r;
      }
    } catch { /* ignore */ }
  }
  if (!allowed) return json({ error: 'unauthorized' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const kind = body.kind === 'personal' ? 'personal' : body.kind === 'master' ? 'master' : null;
  const replayId: string = String(body.replay_id || '');
  const label: string = String(body.label || '').slice(0, 120);
  const maxDevices: number = Math.max(1, Math.min(10, parseInt(body.max_devices ?? '1') || 1));
  const requestedBy: string = String(body.requested_by || '').slice(0, 32);
  const source: 'bot' | 'admin' | 'pakasir' = body.source === 'admin' || body.source === 'pakasir' ? body.source : 'bot';

  if (!kind || !replayId) return json({ error: 'missing_fields' }, 400);

  const { data: replay } = await admin
    .from('replays')
    .select('id,title,date,password')
    .eq('id', replayId).maybeSingle();
  if (!replay) return json({ error: 'replay_not_found' }, 404);

  const { data: settings } = await admin.from('site_settings').select('key,value');
  const settingsMap = new Map((settings ?? []).map((s: any) => [s.key, s.value]));
  const origin = (settingsMap.get('site_origin') as string) || 'https://realtime48show.my.id';
  const liveUrl = `${origin}/live`;

  // Sandi live: ambil dari active_show terkait replay; fallback ke live_config_private.
  let livePassword = '';
  const { data: aShow } = await admin
    .from('active_shows')
    .select('live_password')
    .eq('replay_id', replayId)
    .eq('is_active', true)
    .maybeSingle();
  // Sandi prioritas: sandi yang diatur admin di show terkait; fallback ke sandi replay.
  const password = (aShow?.live_password ? String(aShow.live_password) : '') || (replay.password ? String(replay.password) : '');
  if (aShow?.live_password) {
    livePassword = String(aShow.live_password);
  } else {
    const { data: lcfg } = await admin.from('live_config_private').select('password').limit(1).maybeSingle();
    if (lcfg?.password) livePassword = String(lcfg.password);
  }

  const token = newToken();

  if (kind === 'master') {
    const { error } = await admin.from('replays').update({ access_token: token }).eq('id', replayId);
    if (error) return json({ error: 'master_create_failed', detail: error.message }, 500);
  } else {
    const { error } = await admin.from('replay_personal_tokens').insert({
      replay_id: replayId, token, label: label || `via ${source}`, max_devices: maxDevices,
    });
    if (error) return json({ error: 'personal_create_failed', detail: error.message }, 500);
  }

  const link = `${origin}/akses?token=${token}&replay=${replayId}`;
  const siteOnly = origin.replace(/^https?:\/\//, '');
  const showDate = replay.date ? new Date(replay.date).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
  }) : '';

  // Info Replay (admin/bot generated): hanya tampilkan domain + sandi.
  // Tidak menyertakan token di link agar user mengakses via halaman utama dengan sandi.
  const tplStr = (settingsMap.get('wa_message_template') as string) || DEFAULT_WA_TPL;
  const message = renderWaTemplate(tplStr, {
    title: replay.title,
    link: siteOnly,
    date: showDate,
    password,
    site: siteOnly,
  });

  await admin.from('token_deliveries').insert({
    phone: requestedBy, replay_id: replayId, replay_title: replay.title,
    access_token: token, link, source, requested_by: requestedBy,
  });

  return json({ ok: true, kind, token, link, message, replay: { id: replay.id, title: replay.title } });
});
