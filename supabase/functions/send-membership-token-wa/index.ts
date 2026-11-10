import { enrichAccessMessage } from '../_shared/group-link.ts';
import { primeReplayHost, rewriteReplay } from '../_shared/replay-origin.ts';
// Admin-only: kirim WA link akses + info replay untuk membership_tokens
// yang dibuat manual oleh admin (tidak terkait order pembayaran).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('62')) return d;
  if (d.startsWith('8')) return '62' + d;
  return d;
}

async function sendFonnteOnce(phone: string, message: string, timeoutMs: number) {
  const tok = Deno.env.get('FONNTE_TOKEN');
  if (!tok) return { ok: false, data: { error: 'no_token' } };
  const target = normalizePhone(phone);
  if (!/^628\d{8,11}$/.test(target)) return { ok: false, data: { error: 'invalid_phone_for_fonnte', target } };
  const form = new FormData();
  form.append('target', target);
  form.append('message', message);
  form.append('countryCode', '62');
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST', headers: { Authorization: tok }, body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw = await res.text();
    let data: unknown;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw: raw.slice(0, 500) }; }
    if (!res.ok && data && typeof data === 'object') {
      data = { ...(data as Record<string, unknown>), http_status: res.status, http_status_text: res.statusText };
    }
    return { ok: res.ok && (data as { status?: boolean })?.status !== false, data };
  } catch (e) { return { ok: false, data: { error: String(e) } }; }
}
async function sendFonnte(phone: string, message: string) {
  const groupAdmin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  message = rewriteReplay(await enrichAccessMessage(groupAdmin, message));
  const attempts = [10000];
  let last: { ok: boolean; data: unknown } = { ok: false, data: { error: 'no_attempt' } };
  for (let i = 0; i < attempts.length; i++) {
    last = await sendFonnteOnce(phone, message, attempts[i]);
    if (last.ok) return last;
  }
  return last;
}

const DEFAULT_TPL =
  '👑 *MEMBERSHIP AKTIF*\n\n📦 *{package_name}*\n📅 Berlaku hingga: {expires_at}\n\n🔗 *Link Akses:*\n{link}\n\n🎬 *Link Replay:* realtime48show.my.id\n\n{replay_info_block}👤 Berlaku untuk *{max_devices} perangkat*.\n\n— *ReplayTime* 💖';

function buildMessage(tpl: string, v: Record<string, string>) {
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
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: ud } = await userClient.auth.getUser();
    const uid = ud?.user?.id;
    const actorEmail = ud?.user?.email || '';
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: uid, _role: 'admin' });
    if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const tokenId = String(body.token_id || '');
    const overridePhone = body.phone ? String(body.phone) : '';
    const overrideReplay = typeof body.replay_info === 'string' ? body.replay_info : null;
    if (!tokenId) {
      return new Response(JSON.stringify({ error: 'no_token_id' }), { status: 400, headers: corsHeaders });
    }

    const { data: tk } = await admin.from('membership_tokens').select('*').eq('id', tokenId).maybeSingle();
    if (!tk) return new Response(JSON.stringify({ error: 'token_not_found' }), { status: 404, headers: corsHeaders });

    let packageName = tk.label || 'Membership';
    let replayInfo = overrideReplay !== null ? overrideReplay : (tk.replay_info || '');
    if (tk.package_id) {
      const { data: pkg } = await admin.from('membership_packages')
        .select('name,replay_info').eq('id', tk.package_id).maybeSingle();
      if (pkg) {
        packageName = pkg.name || packageName;
        if (!replayInfo) replayInfo = pkg.replay_info || '';
      }
    }

    const phone = (overridePhone || tk.phone || '').trim();
    if (!phone) return new Response(JSON.stringify({ error: 'no_phone' }), { status: 400, headers: corsHeaders });

    const { data: settings } = await admin
      .from('site_settings').select('key,value').in('key', ['site_origin', 'wa_membership_template']);
    const sm = new Map((settings ?? []).map((s) => [s.key, s.value]));
    const origin = (sm.get('site_origin') || 'https://realtime48show.my.id').replace(/\/+$/, '');
    const tpl = sm.get('wa_membership_template') || DEFAULT_TPL;

    const link = `${origin}/live?mtoken=${encodeURIComponent(tk.token)}&mp=${encodeURIComponent(tk.password)}`;
    const expiresStr = tk.expires_at
      ? new Date(tk.expires_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
      : '';
    const message = buildMessage(tpl, {
      package_name: packageName,
      link,
      password: tk.password || '',
      expires_at: expiresStr,
      duration_days: String(tk.duration_days || ''),
      max_devices: String(tk.max_devices || 1),
      replay_info: replayInfo,
      site: origin.replace(/^https?:\/\//, ''),
    });

    const sent = await sendFonnte(phone, message);

    await admin.from('wa_outbox').insert({
      phone, message, status: sent.ok ? 'sent' : 'failed',
      error: sent.ok ? null : JSON.stringify(sent.data),
      related_order_id: null, fonnte_response: sent.data as Record<string, unknown>,
    });
    await admin.from('token_deliveries').insert({
      phone, replay_id: null, replay_title: `Membership • ${packageName}`,
      order_id: null, access_token: tk.token, link,
      source: 'admin-manual', requested_by: actorEmail || 'send-membership-token-wa',
    });
    await admin.from('admin_action_logs').insert({
      actor_user_id: uid, actor_email: actorEmail,
      action: 'membership_manual_send',
      filter: { token_id: tokenId, phone_override: !!overridePhone },
      order_ids: [], affected_count: 1,
      details: { token_id: tokenId, ok: sent.ok, response: sent.data },
    });

    return new Response(JSON.stringify({ ok: sent.ok, data: sent.data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
