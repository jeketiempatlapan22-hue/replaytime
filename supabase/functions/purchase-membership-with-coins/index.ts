import { primeReplayHost, rewriteReplay } from '../_shared/replay-origin.ts';
// Tukar koin untuk membership. Wajib login. Atomic: reserve → debit → finalize → kirim WA.
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
const validPhone = (p: string) => /^628\d{8,11}$/.test(p);
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

async function sendFonnteOnce(phone: string, message: string) {
  const tok = Deno.env.get('FONNTE_TOKEN'); if (!tok) return { ok: false, data: { error: 'no_token' } };
  const target = normalizePhone(phone);
  if (!/^628\d{8,11}$/.test(target)) return { ok: false, data: { error: 'invalid_phone_for_fonnte', target } };
  const form = new FormData();
  form.append('target', target); form.append('message', message); form.append('countryCode', '62');
  try {
    const res = await fetch('https://api.fonnte.com/send', { method: 'POST', headers: { Authorization: tok }, body: form, signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && (data as any)?.status !== false, data };
  } catch (e) { return { ok: false, data: { error: String(e) } }; }
}
async function sendFonnte(phone: string, message: string) {
  message = rewriteReplay(message);
  const delays = [0, 1000, 3000];
  let last: any = { ok: false, data: { error: 'no_attempt' } };
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    last = await sendFonnteOnce(phone, message);
    if (last.ok) return last;
  }
  return last;
}

export function buildMembershipMessage(tpl: string, vars: Record<string, string>) {
  return tpl
    .replace(/\{package_name\}/g, vars.package_name || '')
    .replace(/\{link\}/g, vars.link || '')
    .replace(/\{password\}/g, vars.password || '')
    .replace(/\{expires_at\}/g, vars.expires_at || '')
    .replace(/\{duration_days\}/g, vars.duration_days || '')
    .replace(/\{max_devices\}/g, vars.max_devices || '1')
    .replace(/\{replay_info\}/g, vars.replay_info || '')
    .replace(/\{replay_info_block\}/g, vars.replay_info ? `🎬 *Info Replay:*\n${vars.replay_info}\n\n` : '')
    .replace(/\{site\}/g, vars.site || '');
}

const DEFAULT_MEMBERSHIP_TPL =
  '👑 *MEMBERSHIP AKTIF*\n\n📦 *{package_name}*\n📅 Berlaku hingga: {expires_at}\n\n🔗 *Link Akses:*\n{link}\n\n🎬 *Link Replay:* realtime48show.my.id\n\n{replay_info_block}👤 Berlaku untuk *{max_devices} perangkat*.\n\n— *ReplayTime* 💖';

Deno.serve(async (req) => {
  await primeReplayHost();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.replace(/^Bearer\s+/i, '');
    if (!jwt) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: ud } = await userClient.auth.getUser();
    const user = ud?.user;
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const package_id = String(body.package_id || '');
    const email = String(body.email || '').trim().toLowerCase();
    const phone = normalizePhone(String(body.phone || ''));
    if (!package_id) return new Response(JSON.stringify({ error: 'missing_package' }), { status: 400, headers: corsHeaders });
    if (!validEmail(email)) return new Response(JSON.stringify({ error: 'invalid_email' }), { status: 400, headers: corsHeaders });
    if (!validPhone(phone)) return new Response(JSON.stringify({ error: 'invalid_phone' }), { status: 400, headers: corsHeaders });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Reserve
    const { data: rsv, error: rerr } = await admin.rpc('reserve_membership_slot', {
      _package_id: package_id, _user_id: user.id, _email: email, _phone: phone, _kind: 'coins',
    });
    if (rerr) {
      const msg = rerr.message || '';
      const known = ['sold_out','package_closed','package_not_found','invalid_coin_price','invalid_email','invalid_phone'];
      const code = known.find((k) => msg.includes(k)) || 'reserve_failed';
      return new Response(JSON.stringify({ error: code, detail: msg }), { status: 400, headers: corsHeaders });
    }
    const row = Array.isArray(rsv) ? rsv[0] : rsv;
    if (!row?.order_id) return new Response(JSON.stringify({ error: 'reserve_failed' }), { status: 500, headers: corsHeaders });

    const price = Number(row.coin_amount || 0);
    // Debit koin
    const { data: newBalance, error: debitErr } = await admin.rpc('debit_coins_for_purchase', {
      _user_id: user.id, _price: price,
      _reason: 'purchase_membership',
      _show_id: null, _replay_id: null,
      _meta: { membership_order_id: row.order_id, package_id } as any,
    });
    if (debitErr) {
      await admin.rpc('release_membership_slot', { _order_id: row.order_id, _reason: 'cancelled' });
      return new Response(JSON.stringify({ error: 'debit_failed', detail: debitErr.message }), { status: 500, headers: corsHeaders });
    }
    if (newBalance === null) {
      await admin.rpc('release_membership_slot', { _order_id: row.order_id, _reason: 'cancelled' });
      return new Response(JSON.stringify({ error: 'insufficient_balance' }), { status: 402, headers: corsHeaders });
    }

    // Finalize → issue token
    const { data: fin, error: ferr } = await admin.rpc('finalize_membership_order', { _order_id: row.order_id });
    if (ferr) return new Response(JSON.stringify({ error: 'finalize_failed', detail: ferr.message }), { status: 500, headers: corsHeaders });
    const tok = Array.isArray(fin) ? fin[0] : fin;

    // Mark order as paid (coin flow)
    await admin.from('membership_orders').update({
      pakasir_order_id: null, updated_at: new Date().toISOString(),
    }).eq('id', row.order_id);

    // WA message
    const { data: settings } = await admin.from('site_settings').select('key,value').in('key', ['site_origin','wa_membership_template']);
    const sm = new Map((settings ?? []).map((s) => [s.key, s.value]));
    const origin = (sm.get('site_origin') || 'https://realtime48show.my.id').replace(/\/+$/, '');
    const tpl = sm.get('wa_membership_template') || DEFAULT_MEMBERSHIP_TPL;
    const link = `${origin}/live?mtoken=${encodeURIComponent(tok.token)}&mp=${encodeURIComponent(tok.password)}`;
    const expiresStr = new Date(tok.expires_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const message = buildMembershipMessage(tpl, {
      package_name: tok.package_name,
      link, password: tok.password,
      expires_at: expiresStr,
      duration_days: String(tok.duration_days || ''),
      max_devices: String(tok.max_devices || 1),
      replay_info: tok.replay_info || '',
      site: origin.replace(/^https?:\/\//, ''),
    });

    const sent = await sendFonnte(phone, message);
    const nowIso = new Date().toISOString();
    await admin.from('membership_orders').update({
      wa_attempts: 1,
      wa_last_attempt_at: nowIso,
      wa_last_error: sent.ok ? null : JSON.stringify(sent.data).slice(0, 500),
      wa_sent_at: sent.ok ? nowIso : null,
    }).eq('id', row.order_id);
    await admin.from('wa_outbox').insert({
      phone, message, status: sent.ok ? 'sent' : 'failed',
      error: sent.ok ? null : JSON.stringify(sent.data),
      related_order_id: row.order_id,
      fonnte_response: sent.data,
    });
    if (sent.ok) {
      await admin.from('token_deliveries').insert({
        phone, replay_id: null, replay_title: `Membership • ${tok.package_name}`,
        order_id: null, access_token: tok.token, link,
        source: 'coins', requested_by: 'purchase-membership-with-coins',
      });
    }

    return new Response(JSON.stringify({
      ok: true, balance: newBalance, link,
      token: tok.token, password: tok.password,
      expires_at: tok.expires_at, sent: sent.ok,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
