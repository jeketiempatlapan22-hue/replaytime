import { primeReplayHost, rewriteReplay } from '../_shared/replay-origin.ts';
import { verifyPakasirPaidStrict } from '../_shared/pakasir.ts';
// Admin-only: kirim ulang notifikasi WA membership (token + link + replay info).
// Bisa satu order atau bulk. Untuk order yang masih 'reserved' tapi sebenarnya
// sudah dibayar di Pakasir, fungsi ini akan cek status dulu lalu finalize.
//
// Fitur:
// - Dedup: jika token sudah ada DAN WA sudah pernah terkirim sukses untuk order
//   yang sama, skip — kecuali `force: true` dikirim.
// - Audit log: tiap pemanggilan dicatat di admin_action_logs (siapa, kapan,
//   filter yang dipakai, daftar order yang dipengaruhi).
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
  const form = new FormData();
  form.append('target', normalizePhone(phone));
  form.append('message', message);
  form.append('countryCode', '62');
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST', headers: { Authorization: tok }, body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && (data as { status?: boolean })?.status !== false, data };
  } catch (e) { return { ok: false, data: { error: String(e) } }; }
}
async function sendFonnte(phone: string, message: string) {
  message = rewriteReplay(message);
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

async function pakasirIsPaid(orderId: string, amount: number): Promise<boolean> {
  const apiKey = Deno.env.get('PAKASIR_API_KEY');
  const slug = Deno.env.get('PAKASIR_PROJECT_SLUG');
  if (!apiKey || !slug || !orderId) return false;
  try {
    const v = await verifyPakasirPaidStrict(apiKey, slug, orderId, Number(amount));
    return v.paid;
  } catch { return false; }
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
    const ids: string[] = Array.isArray(body.order_ids) ? body.order_ids.filter((x: unknown) => typeof x === 'string') : (body.order_id ? [String(body.order_id)] : []);
    const force: boolean = body.force === true;
    const filterMeta = body.filter && typeof body.filter === 'object' ? body.filter : {};
    if (ids.length === 0) {
      return new Response(JSON.stringify({ error: 'no_order_ids' }), { status: 400, headers: corsHeaders });
    }
    if (ids.length > 200) {
      return new Response(JSON.stringify({ error: 'too_many' }), { status: 400, headers: corsHeaders });
    }

    const { data: settings } = await admin
      .from('site_settings').select('key,value').in('key', ['site_origin', 'wa_membership_template']);
    const sm = new Map((settings ?? []).map((s) => [s.key, s.value]));
    const origin = (sm.get('site_origin') || 'https://realtime48show.my.id').replace(/\/+$/, '');
    const tpl = sm.get('wa_membership_template') || DEFAULT_TPL;

    const results: any[] = [];
    for (const oid of ids) {
      try {
        const { data: order } = await admin.from('membership_orders').select('*').eq('id', oid).maybeSingle();
        if (!order) { results.push({ id: oid, error: 'not_found' }); continue; }

        // Dedup: jika sudah ada token DAN WA sudah terkirim sukses, skip kecuali force.
        if (!force && order.membership_token_id && order.wa_sent_at) {
          results.push({ id: oid, skipped: 'already_delivered', phone: order.phone });
          continue;
        }

        // Bila masih reserved & ada pakasir_order_id → coba cek status dulu.
        if (order.status === 'reserved' && order.kind === 'qris' && order.pakasir_order_id) {
          const paid = await pakasirIsPaid(order.pakasir_order_id, Number(order.amount || 0));
          if (!paid) { results.push({ id: oid, skipped: 'not_paid_yet' }); continue; }
        } else if (order.status !== 'paid' && order.status !== 'reserved') {
          results.push({ id: oid, skipped: `status_${order.status}` }); continue;
        }

        // Finalize jika belum ada token.
        let tok: any = null;
        if (!order.membership_token_id) {
          const { data: fin, error: ferr } = await admin.rpc('finalize_membership_order', { _order_id: oid });
          if (ferr) {
            await admin.from('membership_orders').update({
              wa_attempts: (order.wa_attempts || 0) + 1,
              wa_last_attempt_at: new Date().toISOString(),
              wa_last_error: 'finalize_failed:' + ferr.message,
            }).eq('id', oid);
            results.push({ id: oid, error: 'finalize_failed:' + ferr.message }); continue;
          }
          tok = Array.isArray(fin) ? fin[0] : fin;
        } else {
          const { data: t } = await admin.from('membership_tokens').select('token,password,expires_at,max_devices,includes_replays,duration_days,package_id').eq('id', order.membership_token_id).maybeSingle();
          const { data: pkg } = await admin.from('membership_packages').select('name,replay_info,duration_days').eq('id', order.package_id).maybeSingle();
          if (!t || !pkg) { results.push({ id: oid, error: 'token_or_pkg_missing' }); continue; }
          tok = {
            token: t.token, password: t.password, expires_at: t.expires_at,
            max_devices: t.max_devices, includes_replays: t.includes_replays,
            duration_days: t.duration_days || pkg.duration_days,
            replay_info: pkg.replay_info || '', package_name: pkg.name,
          };
        }

        const link = `${origin}/live?mtoken=${encodeURIComponent(tok.token)}&mp=${encodeURIComponent(tok.password)}`;
        const expiresStr = new Date(tok.expires_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        const message = buildMessage(tpl, {
          package_name: tok.package_name || '',
          link, password: tok.password || '',
          expires_at: expiresStr,
          duration_days: String(tok.duration_days || ''),
          max_devices: String(tok.max_devices || 1),
          replay_info: tok.replay_info || '',
          site: origin.replace(/^https?:\/\//, ''),
        });

        const sent = await sendFonnte(order.phone, message);
        const nowIso = new Date().toISOString();
        await admin.from('membership_orders').update({
          wa_attempts: (order.wa_attempts || 0) + 1,
          wa_last_attempt_at: nowIso,
          wa_last_error: sent.ok ? null : JSON.stringify(sent.data).slice(0, 500),
          wa_sent_at: sent.ok ? nowIso : order.wa_sent_at,
        }).eq('id', oid);
        await admin.from('wa_outbox').insert({
          phone: order.phone, message, status: sent.ok ? 'sent' : 'failed',
          error: sent.ok ? null : JSON.stringify(sent.data),
          related_order_id: order.id, fonnte_response: sent.data as Record<string, unknown>,
        });
        await admin.from('token_deliveries').insert({
          phone: order.phone, replay_id: null, replay_title: `Membership • ${tok.package_name}`,
          order_id: null, access_token: tok.token, link,
          source: 'admin-resend', requested_by: 'resend-membership-wa',
        });
        results.push({ id: oid, sent: sent.ok, phone: order.phone });
      } catch (e) {
        results.push({ id: oid, error: String(e) });
      }
    }

    const ok = results.filter((r) => r.sent).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => r.error).length;

    // Audit log: siapa, kapan, filter, daftar order yang dipengaruhi
    await admin.from('admin_action_logs').insert({
      actor_user_id: uid,
      actor_email: actorEmail,
      action: ids.length > 1 ? 'membership_resend_bulk' : 'membership_resend_single',
      filter: { ...filterMeta, force },
      order_ids: ids,
      affected_count: ids.length,
      details: { sent: ok, skipped, failed, results },
    });

    return new Response(JSON.stringify({ ok: true, total: ids.length, sent: ok, skipped, failed, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
