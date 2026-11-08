import { primeReplayHost, rewriteReplay } from '../_shared/replay-origin.ts';
// Fonnte incoming webhook → handle commands. Public endpoint.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bot-test, x-webhook-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function normalizePhone(raw: string) {
  const d = String(raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('62')) return d;
  if (d.startsWith('8')) return '62' + d;
  return d;
}

function pickFirstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function uniquePhones(values: string[]) {
  return Array.from(new Set(values.map(normalizePhone).filter(Boolean)));
}

async function sendFonnte(phone: string, message: string, inboxId = ''): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  message = rewriteReplay(message);
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) return { ok: false, error: 'FONNTE_TOKEN not configured' };
  const buildForm = (withInbox: boolean) => {
    const form = new FormData();
    form.append('target', normalizePhone(phone));
    form.append('message', message);
    form.append('countryCode', '62');
    if (withInbox && /^\d+$/.test(inboxId)) form.append('inboxid', inboxId);
    return form;
  };
  const timeouts = [12000];
  let last: { ok: boolean; data?: unknown; error?: string } = { ok: false, error: 'no_attempt' };
  for (const timeoutMs of timeouts) {
    try {
      let res = await fetch('https://api.fonnte.com/send', {
        method: 'POST', headers: { Authorization: token }, body: buildForm(true), signal: AbortSignal.timeout(timeoutMs),
      });
      let raw = await res.text();
      let data: unknown;
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw: raw.slice(0, 500) }; }
      if (!res.ok && data && typeof data === 'object') data = { ...(data as Record<string, unknown>), http_status: res.status, http_status_text: res.statusText };
      let ok = res.ok && (data as { status?: boolean })?.status !== false;
      const reason = String((data as { reason?: string })?.reason || '').toLowerCase();
      if (!ok && inboxId && (reason.includes('inbox') || reason.includes('body'))) {
        res = await fetch('https://api.fonnte.com/send', {
          method: 'POST', headers: { Authorization: token }, body: buildForm(false), signal: AbortSignal.timeout(timeoutMs),
        });
        raw = await res.text();
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw: raw.slice(0, 500) }; }
        if (!res.ok && data && typeof data === 'object') data = { ...(data as Record<string, unknown>), http_status: res.status, http_status_text: res.statusText };
        ok = res.ok && (data as { status?: boolean })?.status !== false;
      }
      last = { ok, data, error: ok ? undefined : JSON.stringify(data) };
      if (ok) return last;
    } catch (e) {
      last = { ok: false, error: e instanceof Error ? e.message : 'send_failed' };
    }
  }
  return last;
}

function buildBaseUrl() {
  // Best-effort site origin; configurable via site_settings(key='site_origin')
  return '';
}

async function sha1(input: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

async function createTokenInline(
  admin: ReturnType<typeof createClient>,
  opts: {
    kind: 'master' | 'personal' | 'replay';
    replayId: string;
    requestedBy: string;
    label?: string;
    maxDevices?: number;
    settingsMap: Map<string, string>;
  },
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const { data: replay } = await admin
      .from('replays').select('id,title,date,password').eq('id', opts.replayId).maybeSingle();
    if (!replay) return { ok: false, error: 'replay_not_found' };

    const origin = (opts.settingsMap.get('site_origin') || 'https://realtime48show.my.id').replace(/\/+$/, '');
    const token = newToken();
    const isPersonal = opts.kind === 'personal';

    // Sandi: prioritas sandi yang diatur admin di show terkait, fallback ke sandi replay.
    const { data: aShow } = await admin
      .from('active_shows').select('live_password')
      .eq('replay_id', opts.replayId).eq('is_active', true).maybeSingle();
    const password = (aShow?.live_password ? String(aShow.live_password) : '')
      || ((replay as any).password ? String((replay as any).password) : '');

    if (isPersonal) {
      const { error } = await admin.from('replay_personal_tokens').insert({
        replay_id: opts.replayId,
        token,
        label: opts.label || `via bot`,
        max_devices: Math.max(1, Math.min(10, opts.maxDevices ?? 1)),
      });
      if (error) return { ok: false, error: 'personal_create_failed:' + error.message };
    } else {
      const { error } = await admin.from('replays')
        .update({ access_token: token }).eq('id', opts.replayId);
      if (error) return { ok: false, error: 'master_create_failed:' + error.message };
    }

    const link = `${origin}/akses?token=${token}&replay=${opts.replayId}`;
    const siteOnly = origin.replace(/^https?:\/\//, '');
    const showDate = (replay as { date?: string }).date
      ? new Date((replay as { date: string }).date).toLocaleDateString('id-ID', {
          day: '2-digit', month: 'long', year: 'numeric',
        })
      : '';
    // Info Replay (bot): tampilkan domain saja + sandi (tanpa token di link).
    const tplStr = (opts.settingsMap.get('wa_message_template') as string) || DEFAULT_WA_TPL;
    const message = renderWaTemplate(tplStr, {
      title: (replay as { title: string }).title,
      link: siteOnly,
      date: showDate,
      password,
      site: siteOnly,
    });

    await admin.from('token_deliveries').insert({
      phone: opts.requestedBy,
      replay_id: opts.replayId,
      replay_title: (replay as { title: string }).title,
      access_token: token,
      link,
      source: 'bot',
      requested_by: opts.requestedBy,
    });

    return { ok: true, message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'inline_failed' };
  }
}

async function isAuthorizedTestRequest(authHeader: string, admin: ReturnType<typeof createClient>) {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bearer = authHeader.replace(/^Bearer\s+/i, '');
  if (bearer && bearer === serviceKey) return true;
  if (!bearer) return false;

  try {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(bearer);
    if (claims?.claims?.role === 'service_role') return true;
    const userId = claims?.claims?.sub;
    if (!userId) return false;
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });
    return !!isAdmin;
  } catch {
    return false;
  }
}

function hasValidWebhookSecret(req: Request) {
  const expectedSecret = Deno.env.get('FONNTE_WEBHOOK_SECRET') || '';
  if (!expectedSecret) return false;
  const provided = req.headers.get('x-webhook-secret') || req.headers.get('X-Webhook-Secret') || '';
  return provided === expectedSecret;
}

function pickWebhookPayload(input: any) {
  if (Array.isArray(input)) return input[0] ?? {};
  if (Array.isArray(input?.data)) return input.data[0] ?? {};
  if (input?.data && typeof input.data === 'object') return input.data;
  return input ?? {};
}

async function logBotEvent(
  admin: ReturnType<typeof createClient>,
  event: {
    phone?: string; device?: string; message?: string; command?: string;
    inboxId?: string; fromMe?: boolean; eventName: string; detail?: Record<string, unknown>;
  },
) {
  try {
    await admin.from('bot_inbox_events').insert({
      phone: event.phone || null,
      device: event.device || null,
      message: event.message || null,
      command: event.command || null,
      inbox_id: event.inboxId || null,
      from_me: event.fromMe ?? false,
      event_name: event.eventName,
      detail: event.detail || {},
    });
  } catch { /* audit logging must never block bot replies */ }
}

function isTimeoutText(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return /timed out|TimeoutError|Signal timed out|abort/i.test(text);
}

async function isFonntePaused(admin: ReturnType<typeof createClient>, windowMs = 15 * 60_000) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data } = await admin.from('wa_outbox')
    .select('status,error,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(8);
  const rows = data ?? [];
  const timeoutFails = rows.filter((r: any) => r.status === 'failed' && isTimeoutText(r.error)).length;
  const hasRecentSent = rows.some((r: any) => r.status === 'sent');
  return timeoutFails >= 3 && !hasRecentSent;
}

async function sendAndAudit(
  admin: ReturnType<typeof createClient>,
  opts: { phone: string; message: string; inboxId?: string; testMode?: boolean; deliverTest?: boolean; command?: string; device?: string; fromMe?: boolean },
) {
  const sendResult = opts.testMode && !opts.deliverTest
    ? { ok: true, data: { skipped: true, reason: 'test_mode' } }
    : await sendFonnte(opts.phone, opts.message, opts.inboxId || '');

  await admin.from('wa_outbox').insert({
    phone: opts.phone,
    message: opts.message,
    status: sendResult.ok ? 'sent' : 'failed',
    error: sendResult.ok ? null : sendResult.error,
    fonnte_response: sendResult.data as Record<string, unknown> | undefined,
  });
  await logBotEvent(admin, {
    phone: opts.phone,
    device: opts.device,
    message: opts.message,
    command: opts.command,
    inboxId: opts.inboxId,
    fromMe: opts.fromMe,
    eventName: sendResult.ok ? 'reply_sent' : 'reply_failed',
    detail: { send: sendResult.data, error: sendResult.error },
  });

  return sendResult;
}

Deno.serve(async (req) => {
  await primeReplayHost();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const authHeader = req.headers.get('Authorization') || '';
  const testMode = req.headers.get('x-bot-test') === 'true';
  const debug = (reason: string, extra: Record<string, unknown> = {}) =>
    testMode ? json({ ok: false, reason, ...extra }) : new Response('ok', { headers: corsHeaders });

  if (testMode && !hasValidWebhookSecret(req) && !(await isAuthorizedTestRequest(authHeader, admin))) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  // Fonnte often cannot attach custom headers to incoming webhooks. Keep the
  // secret check optional so the real WhatsApp webhook still replies; admin
  // commands remain protected by the bot_admins phone whitelist below.
  const webhookSecretOk = !Deno.env.get('FONNTE_WEBHOOK_SECRET') || hasValidWebhookSecret(req);

  // Fonnte sends as multipart/form-data, x-www-form-urlencoded, or json
  let phone = '', text = '', device = '', inboxId = '', fromMe = false, deliverTest = false, participant = '';
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = pickWebhookPayload(await req.json());
      phone = pickFirstText(j.sender, j.from, j.phone, j.target, j.number, j.remoteJid, j.chat, j.group_id);
      participant = pickFirstText(j.participant, j.member, j.author, j.pushname_number, j.sender_number);
      device = String(j.device ?? j.device_number ?? '');
      text = pickFirstText(j.message, j.text, j.body, j.caption, j.content, j.msg, j.conversation);
      inboxId = String(j.inboxid ?? j.inbox_id ?? j.id ?? '');
      fromMe = j.fromMe === true || j.fromMe === 'true' || j.from_me === true;
      deliverTest = j.deliver === true || j.deliver === 'true' || j.test_deliver === true;
    } else if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
      const fd = await req.formData();
      phone = pickFirstText(fd.get('sender'), fd.get('from'), fd.get('phone'), fd.get('target'), fd.get('number'), fd.get('remoteJid'), fd.get('chat'), fd.get('group_id'));
      participant = pickFirstText(fd.get('participant'), fd.get('member'), fd.get('author'), fd.get('pushname_number'), fd.get('sender_number'));
      device = String(fd.get('device') ?? fd.get('device_number') ?? '');
      text = pickFirstText(fd.get('message'), fd.get('text'), fd.get('body'), fd.get('caption'), fd.get('content'), fd.get('msg'), fd.get('conversation'));
      inboxId = String(fd.get('inboxid') ?? fd.get('inbox_id') ?? fd.get('id') ?? '');
      fromMe = String(fd.get('fromMe') ?? fd.get('from_me') ?? '') === 'true';
      deliverTest = String(fd.get('deliver') ?? fd.get('test_deliver') ?? '') === 'true';
    } else {
      const raw = (await req.text()).trim();
      try {
        const j = pickWebhookPayload(JSON.parse(raw));
        phone = pickFirstText(j.sender, j.from, j.phone, j.target, j.number, j.remoteJid, j.chat, j.group_id);
        participant = pickFirstText(j.participant, j.member, j.author, j.pushname_number, j.sender_number);
        device = String(j.device ?? j.device_number ?? '');
        text = pickFirstText(j.message, j.text, j.body, j.caption, j.content, j.msg, j.conversation);
        inboxId = String(j.inboxid ?? j.inbox_id ?? j.id ?? '');
        fromMe = j.fromMe === true || j.fromMe === 'true' || j.from_me === true;
        deliverTest = j.deliver === true || j.deliver === 'true' || j.test_deliver === true;
      } catch {
        text = raw;
      }
    }
  } catch {
    return debug('bad_payload');
  }

  if (!phone || !text) return debug('missing_phone_or_text');

  let phoneNorm = normalizePhone(phone);
  const participantNorm = normalizePhone(participant);
  const deviceNorm = normalizePhone(device);
  const commandPreview = text.toLowerCase().split(/\s+/)[0] || '';

  // Group chat detection: WhatsApp group JIDs are very long numeric strings (e.g. 120363...)
  // or end with "@g.us". When a message comes from a group, Fonnte cannot send a reply to
  // the group ID — we must reply to the actual participant (admin/reseller) who sent the
  // command. Authorization still works because participantNorm is included in candidatePhones.
  const rawPhoneStr = String(phone || '');
  const isGroup = !!participantNorm && (
    rawPhoneStr.includes('@g.us') ||
    rawPhoneStr.includes('-') ||           // Some Fonnte payloads use 12345-67890@g.us
    phoneNorm.length > 15 ||                // Group JIDs are ~18 digits
    participantNorm !== phoneNorm           // Participant differs from chat target → group
  );
  const groupId = isGroup ? phoneNorm : '';
  if (isGroup) phoneNorm = participantNorm;

  await logBotEvent(admin, {
    phone: phoneNorm,
    device: deviceNorm,
    message: text,
    command: commandPreview,
    inboxId,
    fromMe,
    eventName: 'received',
    detail: { ...(participantNorm ? { participant: participantNorm, group_id: groupId || undefined } : {}), webhook_secret: webhookSecretOk ? 'ok' : 'missing' },
  });

  // Only process commands starting with '/' — silently ignore other chatter
  if (!text.startsWith('/')) {
    await logBotEvent(admin, { phone: phoneNorm, device: deviceNorm, message: text, command: commandPreview, inboxId, fromMe, eventName: 'ignored_not_command' });
    return debug('not_a_command', { phone: phoneNorm, text });
  }

  // Anti-loop: ignore echoes, but still allow slash commands from the device owner/self chat.
  if (!testMode && fromMe && !text.startsWith('/')) return new Response('ok', { headers: corsHeaders });
  if (!testMode && deviceNorm && deviceNorm === phoneNorm && !text.startsWith('/')) return new Response('ok', { headers: corsHeaders });

  // Dedup: same phone+message within ~20s = duplicate webhook delivery from Fonnte.
  // Prune FIRST so genuine repeated commands (>20s apart) are not blocked.
  if (!testMode) {
    const hash = await sha1(text);
    await admin.from('bot_inbox_dedup')
      .delete()
      .lt('received_at', new Date(Date.now() - 20_000).toISOString());
    const { error: dupErr } = await admin
      .from('bot_inbox_dedup')
      .insert({ phone: phoneNorm, message_hash: hash });
    if (dupErr) {
      // Likely unique violation → already processed in last 20s
      await logBotEvent(admin, { phone: phoneNorm, device: deviceNorm, message: text, command: commandPreview, inboxId, fromMe, eventName: 'ignored_duplicate', detail: { error: dupErr.message } });
      return new Response('ok', { headers: corsHeaders });
    }
  }

  const lower = text.toLowerCase();
  const [cmd, ...rest] = lower.split(/\s+/);
  const arg = rest.join(' ').trim();
  const ADMIN_ONLY = new Set(['/test', '/buattoken', '/createtoken', '/createtokenrep', '/createlink', '/createpub', '/golive', '/unlive']);

  // Per-phone rate limit: max 1 reply per 2 seconds, but never throttle admin token commands.
  if (!testMode) {
    const RL_WINDOW_MS = ADMIN_ONLY.has(cmd) ? 0 : 2000;
    const { data: rl } = await admin.from('bot_rate_limit')
      .select('last_sent_at').eq('phone', phoneNorm).maybeSingle();
    if (RL_WINDOW_MS > 0 && rl?.last_sent_at && Date.now() - new Date(rl.last_sent_at).getTime() < RL_WINDOW_MS) {
      await logBotEvent(admin, { phone: phoneNorm, device: deviceNorm, message: text, command: commandPreview, inboxId, fromMe, eventName: 'ignored_rate_limited', detail: { last_sent_at: rl.last_sent_at } });
      return new Response('ok', { headers: corsHeaders });
    }
    await admin.from('bot_rate_limit').upsert({ phone: phoneNorm, last_sent_at: new Date().toISOString() });
    // Janitor for rate limit (>10 min)
    await admin.from('bot_rate_limit').delete()
      .lt('last_sent_at', new Date(Date.now() - 10 * 60_000).toISOString());
  }

  // Lookup command template
  const { data: command } = await admin
    .from('bot_commands')
    .select('*')
    .eq('trigger', cmd)
    .eq('enabled', true)
    .maybeSingle();

  if (!command) {
    const unknownReply = '❓ Command tidak dikenali. Ketik */menu* untuk daftar perintah.';
    const background = sendAndAudit(admin, {
      phone: phoneNorm,
      message: unknownReply,
      inboxId,
      testMode,
      deliverTest,
      command: cmd,
      device: deviceNorm,
      fromMe,
    });
    if (testMode) {
      const sendResult = await background;
      return json({ ok: true, phone: phoneNorm, command: cmd, reply: unknownReply, delivered: deliverTest, send: sendResult });
    }
    const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(background);
    else await background;
    return new Response('accepted', { status: 202, headers: corsHeaders });
  }

  // Admin-only commands
  let isBotAdmin = false;
  if (ADMIN_ONLY.has(cmd)) {
    const candidatePhones = uniquePhones([phoneNorm, participantNorm, fromMe ? deviceNorm : '']);
    const { data: admins } = await admin
      .from('bot_admins')
      .select('phone')
      .in('phone', candidatePhones.length ? candidatePhones : [phoneNorm])
      .eq('enabled', true)
    const adminPhones = new Set((admins ?? []).map((a: any) => normalizePhone(a.phone)));
    isBotAdmin = candidatePhones.some((p) => adminPhones.has(p));
    if (!isBotAdmin) {
      const deniedMessage = '🔒 Command ini hanya untuk admin bot. Hubungi owner untuk akses.';
      const background = sendAndAudit(admin, {
        phone: phoneNorm,
        message: deniedMessage,
        inboxId,
        testMode,
        deliverTest,
        command: cmd,
        device: deviceNorm,
        fromMe,
      });
      if (testMode) {
        const sendResult = await background;
        return json({ ok: true, phone: phoneNorm, command: cmd, reply: deniedMessage, delivered: deliverTest, send: sendResult });
      }
      const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(background);
      else await background;
      return new Response('accepted', { status: 202, headers: corsHeaders });
    }
  }

  const processAndSendReply = async () => {
  let reply = command.response_template ?? '';

  // Settings substitution
  const { data: settings } = await admin.from('site_settings').select('key,value');
  const map = new Map((settings ?? []).map((s) => [s.key, s.value]));
  reply = reply.replaceAll('{{ADMIN_PHONE}}', map.get('whatsapp_number') ?? '');

  // Dynamic handlers
  if (command.is_dynamic) {
    if (cmd === '/menu') {
      const { data: cmds } = await admin
        .from('bot_commands')
        .select('trigger,description')
        .eq('enabled', true)
        .order('sort_order', { ascending: true });
      const list = (cmds ?? []).map((c: any) => `• *${c.trigger}*${c.description ? ` — ${c.description}` : ''}`).join('\n');
      reply = `📋 *DAFTAR COMMAND*\n\n${list}\n\nKetik salah satu untuk mencoba.`;
    } else if (cmd === '/show') {
      const { data: shows } = await admin
        .from('active_shows')
        .select('title,show_date,show_time,category,lineup')
        .eq('is_active', true)
        .order('show_date', { ascending: true })
        .order('show_time', { ascending: true })
        .limit(10);
      if (!shows?.length) {
        reply = '📭 Belum ada show aktif saat ini.';
      } else {
        reply = '🎤 *SHOW AKTIF*\n\n' + shows.map((s) => {
          const lineup = (s.lineup ?? []).join(', ');
          return `• *${s.title}*\n  📅 ${s.show_date} ${String(s.show_time).slice(0,5)}\n  🏷️ ${s.category}${lineup ? `\n  👥 ${lineup}` : ''}`;
        }).join('\n\n');
      }
    } else if (cmd === '/cek') {
      // Recheck the user's most recent pending order via DOKU poller.
      const { data: lastOrder } = await admin
        .from('orders')
        .select('id,user_id,status,kind,token_sent_at,access_token,replay_id,show_id,item_title,pakasir_order_id,amount')
        .eq('user_phone', phoneNorm)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastOrder) {
        reply = '📭 Belum ada order atas nomor ini. Silakan beli show dari aplikasi terlebih dahulu.';
      } else if (lastOrder.kind === 'coin_topup' && lastOrder.status === 'paid') {
        const { data: bal } = await admin.from('coin_balances').select('balance').eq('user_id', (lastOrder as any).user_id).maybeSingle();
        reply = `✅ Top-up koin Anda sudah lunas dan diproses.\nSaldo saat ini: *${(bal as any)?.balance ?? '-'}* koin.`;
      } else if (lastOrder.status === 'paid' && lastOrder.access_token) {
        if (lastOrder.pakasir_order_id && Number((lastOrder as any).amount || 0) > 0) {
          const verifyRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/check-doku-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
            body: JSON.stringify({ order_id: lastOrder.id }),
          });
          const verifyJson: any = await verifyRes.json().catch(() => ({}));
          if (verifyJson?.status !== 'paid') {
            reply = `⏳ Pembayaran *${lastOrder.pakasir_order_id}* belum terverifikasi DOKU. Coba */cek* lagi setelah pembayaran berhasil.`;
          } else {
            const origin = (map.get('site_origin') || 'https://realtime48show.my.id').replace(/\/+$/, '');
            const link = lastOrder.show_id && !lastOrder.replay_id
              ? `${origin}/live?show=${lastOrder.show_id}&t=${lastOrder.access_token}`
              : `${origin}/akses?token=${lastOrder.access_token}${lastOrder.replay_id ? `&replay=${lastOrder.replay_id}` : ''}`;
            reply = `✅ Order Anda sudah lunas.\n\n${lastOrder.item_title}\n🔗 ${link}`;
          }
        } else {
        const origin = (map.get('site_origin') || 'https://realtime48show.my.id').replace(/\/+$/, '');
        const link = lastOrder.show_id && !lastOrder.replay_id
          ? `${origin}/live?show=${lastOrder.show_id}&t=${lastOrder.access_token}`
          : `${origin}/akses?token=${lastOrder.access_token}${lastOrder.replay_id ? `&replay=${lastOrder.replay_id}` : ''}`;
        reply = `✅ Order Anda sudah lunas.\n\n${lastOrder.item_title}\n🔗 ${link}`;
        }
      } else {
        try {
          const pollRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/check-doku-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
            body: JSON.stringify({ order_id: lastOrder.id }),
          });
          const pollJson: any = await pollRes.json().catch(() => ({}));
          if (pollJson?.status === 'paid') {
            reply = `✅ Pembayaran terkonfirmasi! Token & link sudah dikirim ke nomor ini. Cek pesan terbaru ya 💖`;
          } else {
            reply = `⏳ Pembayaran *${lastOrder.pakasir_order_id || lastOrder.id.slice(0,8)}* masih *${pollJson?.status || 'pending'}*.\nSelesaikan pembayaran QRIS, lalu coba */cek* lagi 1-2 menit kemudian.`;
          }
        } catch {
          reply = `⚠️ Tidak dapat menghubungi server pembayaran. Coba */cek* lagi sebentar.`;
        }
      }
    } else if (cmd === '/buattoken') {
      if (!arg) {
        const { data: replays } = await admin
          .from('replays')
          .select('id,title,date,admin_alias')
          .order('date', { ascending: false })
          .limit(8);
        if (!replays?.length) {
          reply = '📭 Belum ada replay tersimpan.';
        } else {
          reply = '🎬 *DAFTAR REPLAY TERBARU*\n\nGunakan: */buattoken <kode|alias>*\n_Kode = 8 karakter pertama ID, atau alias admin._\n\n' +
            replays.map((r: any) => {
              const aliasLine = r.admin_alias ? `\n  🏷️ alias: \`${r.admin_alias}\`` : '';
              return `• \`${r.id.slice(0,8)}\` — ${r.title}\n  📅 ${r.date}${aliasLine}`;
            }).join('\n\n');
        }
      } else {
        const code = arg.trim().toLowerCase();
        // Lookup: by admin_alias (exact, case-insensitive) OR by id prefix
        const { data: byAlias } = await admin
          .from('replays').select('id,title').ilike('admin_alias', code).limit(2);
        let matches = byAlias ?? [];
        if (!matches.length) {
          const { data: byId } = await admin
            .from('replays').select('id,title').ilike('id', `${code}%`).limit(2);
          matches = byId ?? [];
        }
        if (!matches.length) reply = `❌ Replay dengan kode/alias *${code}* tidak ditemukan.`;
        else if (matches.length > 1) reply = `⚠️ Kode *${code}* ambigu (${matches.length} match). Gunakan kode lebih panjang atau alias unik.`;
        else {
          const r = matches[0];
          const res = await createTokenInline(admin, {
            kind: 'master', replayId: r.id, requestedBy: phoneNorm,
            label: `Bot ${phoneNorm}`, settingsMap: map as Map<string, string>,
          });
          reply = res.ok && res.message ? res.message : `❌ Gagal membuat token master. ${res.error || ''}`.trim();
        }
      }
    } else if (cmd === '/createtokenrep') {
      const code = arg.trim().toLowerCase();
      if (!code) {
        reply = 'ℹ️ Format: */createtokenrep <id|alias>*\n_Pakai alias admin yang Anda set di kartu replay, atau 8 karakter pertama ID._';
      } else {
        const { data: byAlias } = await admin
          .from('replays').select('id,title').ilike('admin_alias', code).limit(2);
        let matches = byAlias ?? [];
        if (!matches.length) {
          const { data: byId } = await admin
            .from('replays').select('id,title').ilike('id', `${code}%`).limit(2);
          matches = byId ?? [];
        }
        if (!matches.length) reply = `❌ Replay dengan id/alias *${code}* tidak ditemukan.`;
        else if (matches.length > 1) reply = `⚠️ *${code}* ambigu (${matches.length} match). Pakai alias unik atau id yang lebih panjang.`;
        else {
          const r = matches[0];
          const res = await createTokenInline(admin, {
            kind: 'replay', replayId: r.id, requestedBy: phoneNorm,
            label: `Bot ${phoneNorm}`, settingsMap: map as Map<string, string>,
          });
          reply = res.ok && res.message ? res.message : `❌ Gagal membuat token replay. ${res.error || ''}`.trim();
        }
      }
    } else if (cmd === '/token') {
      if (!arg) {
        reply = 'ℹ️ Format: */token <kode_order>*\nContoh: /token ABC123';
      } else {
        const { data: order } = await admin
          .from('orders')
          .select('id,status,access_token,item_title,user_phone,replay_id')
          .or(`pakasir_order_id.eq.${arg},id.eq.${arg.length === 36 ? arg : '00000000-0000-0000-0000-000000000000'}`)
          .maybeSingle();

        if (!order) reply = `❌ Order *${arg}* tidak ditemukan.`;
        else if (order.user_phone !== phoneNorm) reply = '🔒 Nomor HP Anda tidak cocok dengan order ini.';
        else if (order.status !== 'paid') reply = `⏳ Order *${arg}* status: *${order.status}*. Belum dapat dikirim.`;
        else if (!order.access_token) reply = `⚠️ Order *${arg}* belum memiliki token. Hubungi admin.`;
        else {
          const origin = map.get('site_origin') || buildBaseUrl();
          const link = `${origin}/akses?token=${order.access_token}${order.replay_id ? `&replay=${order.replay_id}` : ''}`;
          reply = `✅ *Token Anda*\n\n${order.item_title}\n🔗 ${link}\n\n_Klik link untuk membuka._`;
          await admin.from('token_deliveries').insert({
            phone: phoneNorm, replay_id: order.replay_id, replay_title: order.item_title,
            order_id: order.id, access_token: order.access_token, link,
            source: 'bot', requested_by: phoneNorm,
          });
        }
      }
    } else if (cmd === '/createtoken') {
      const parts = arg.split(/\s+/).filter(Boolean);
      const code = (parts[0] || '').toLowerCase();
      const label = parts.slice(1).join(' ').trim();
      if (!code) {
        reply = 'ℹ️ Format: */createtoken <kode|alias> [label]*\n_Token replay personal (1 device). Kode = 8 karakter pertama ID replay, atau alias admin._\nKetik */buattoken* untuk melihat daftar replay.';
      } else {
        const { data: byAlias } = await admin
          .from('replays').select('id,title').ilike('admin_alias', code).limit(2);
        let matches = byAlias ?? [];
        if (!matches.length) {
          const { data: byId } = await admin
            .from('replays').select('id,title').ilike('id', `${code}%`).limit(2);
          matches = byId ?? [];
        }
        if (!matches.length) reply = `❌ Replay dengan kode/alias *${code}* tidak ditemukan.`;
        else if (matches.length > 1) reply = `⚠️ Kode *${code}* ambigu. Gunakan kode lebih panjang atau alias unik.`;
        else {
          const r = matches[0];
          const res = await createTokenInline(admin, {
            kind: 'personal', replayId: r.id, requestedBy: phoneNorm,
            label: label || `Bot ${phoneNorm}`, maxDevices: 1,
            settingsMap: map as Map<string, string>,
          });
          reply = res.ok && res.message ? res.message : `❌ Gagal membuat token satuan. ${res.error || ''}`.trim();
        }
      }
    } else if (cmd === '/createlink' || cmd === '/createpub') {
      const parts = arg.split(/\s+/).filter(Boolean);
      const code = (parts[0] || '').toLowerCase();
      const label = parts.slice(1).join(' ').trim();
      const isPublic = cmd === '/createpub';
      if (!code) {
        const { data: shows } = await admin
          .from('active_shows').select('id,title,show_date,show_time,admin_alias,is_live,live_auto_schedule')
          .eq('is_active', true).order('show_date', { ascending: false }).limit(10);
        const lines = (shows ?? []).map((s: any) => {
          const aliasLine = s.admin_alias ? `\n  🏷️ alias: \`${s.admin_alias}\`` : '';
          const liveTag = s.is_live ? ' 🔴 LIVE' : (s.live_auto_schedule ? ' ⏰ AUTO' : '');
          return `• \`${s.id.slice(0,8)}\` — ${s.title}${liveTag}\n  📅 ${s.show_date} ${String(s.show_time).slice(0,5)}${aliasLine}`;
        });
        reply = `ℹ️ Format: *${cmd} <kode|alias> [label]*\n_${isPublic ? 'Token publik (multi-device)' : 'Token satuan (1 device)'} untuk akses LIVE per show._\n\n` +
          (lines.length ? `🎤 *DAFTAR SHOW AKTIF*\n\n${lines.join('\n\n')}` : '📭 Belum ada show aktif.');
      } else {
        const { data: byAlias } = await admin
          .from('active_shows').select('id,title,show_date,show_time,live_password').ilike('admin_alias', code).limit(2);
        let matches = byAlias ?? [];
        if (!matches.length) {
          const { data: byId } = await admin
            .from('active_shows').select('id,title,show_date,show_time,live_password').ilike('id', `${code}%`).limit(2);
          matches = byId ?? [];
        }
        if (!matches.length) reply = `❌ Show dengan kode/alias *${code}* tidak ditemukan.`;
        else if (matches.length > 1) reply = `⚠️ Kode *${code}* ambigu. Pakai alias unik atau id lebih panjang.`;
        else {
          const s: any = matches[0];
          const token = newToken();
          const maxDevices = isPublic ? 50 : 1;
          const { error } = await admin.from('active_show_tokens').insert({
            show_id: s.id, token, kind: isPublic ? 'public' : 'personal',
            max_devices: maxDevices, label: label || `Bot ${phoneNorm}`,
          });
          if (error) {
            reply = `❌ Gagal membuat token. ${error.message}`;
          } else {
            const origin = (map.get('site_origin') || 'https://realtime48show.my.id').replace(/\/+$/, '');
            const link = `${origin}/live?show=${s.id}&t=${token}`;
            const header = isPublic ? '🎁 *TOKEN LIVE PUBLIK*' : '🔐 *TOKEN LIVE SATUAN*';
            const access = isPublic ? '🔓 Bisa dibuka di banyak perangkat.' : '👤 Hanya untuk *1 perangkat pertama*.';
            const livePwd = s.live_password ? String(s.live_password) : '';
            reply = [
              header,
              '',
              `🎤 *${s.title}*`,
              `📅 ${s.show_date} ${String(s.show_time).slice(0,5)}`,
              '',
              '🔗 *Link Live:*',
              link,
              '',
              '🎬 *Link Replay:*',
              'realtime48show.my.id',
              livePwd ? `🗝️ Sandi: *${livePwd}*` : null,
              '',
              access,
              '',
              '— *ReplayTime* 💖',
            ].filter((l) => l !== null).join('\n');
          }
        }
      }
    } else if (cmd === '/golive' || cmd === '/unlive') {
      // Toggle is_live flag for a show by alias or id-prefix.
      // Format: /golive <alias|id>   /unlive <alias|id>
      const code = arg.trim().toLowerCase();
      const turnOn = cmd === '/golive';
      if (!code) {
        const { data: shows } = await admin
          .from('active_shows').select('id,title,show_date,show_time,admin_alias,is_live')
          .eq('is_active', true).order('show_date', { ascending: false }).limit(10);
        const lines = (shows ?? []).map((s: any) => {
          const aliasLine = s.admin_alias ? `\n  🏷️ alias: \`${s.admin_alias}\`` : '';
          const liveTag = s.is_live ? ' 🔴 LIVE' : '';
          return `• \`${s.id.slice(0,8)}\` — ${s.title}${liveTag}\n  📅 ${s.show_date} ${String(s.show_time).slice(0,5)}${aliasLine}`;
        });
        reply = `ℹ️ Format: *${cmd} <kode|alias>*\n_${turnOn ? 'Aktifkan' : 'Nonaktifkan'} status LIVE untuk show._\n\n` +
          (lines.length ? `🎤 *DAFTAR SHOW AKTIF*\n\n${lines.join('\n\n')}` : '📭 Belum ada show aktif.');
      } else {
        const { data: byAlias } = await admin
          .from('active_shows').select('id,title,is_live,admin_alias').ilike('admin_alias', code).limit(2);
        let matches = byAlias ?? [];
        if (!matches.length) {
          const { data: byId } = await admin
            .from('active_shows').select('id,title,is_live,admin_alias').ilike('id', `${code}%`).limit(2);
          matches = byId ?? [];
        }
        if (!matches.length) reply = `❌ Show dengan kode/alias *${code}* tidak ditemukan.`;
        else if (matches.length > 1) reply = `⚠️ Kode *${code}* ambigu (${matches.length} match). Pakai alias unik atau id lebih panjang.`;
        else {
          const s: any = matches[0];
          if (turnOn) {
            // Auto-disable any other show currently live to keep a single active LIVE.
            await admin.from('active_shows').update({ is_live: false }).neq('id', s.id).eq('is_live', true);
          }
          // When turning live ON, also ensure show is active so it appears on home page.
          const updatePayload: Record<string, unknown> = { is_live: turnOn };
          if (turnOn) updatePayload.is_active = true;
          const { error } = await admin.from('active_shows')
            .update(updatePayload).eq('id', s.id);
          if (error) {
            reply = `❌ Gagal mengubah status. ${error.message}`;
          } else {
            reply = turnOn
              ? `🔴 *LIVE DIAKTIFKAN*\n\n🎤 ${s.title}\n🆔 \`${s.id.slice(0,8)}\`${s.admin_alias ? `\n🏷️ ${s.admin_alias}` : ''}\n\n✅ Show ini sekarang tampil sebagai LIVE di halaman utama.`
              : `⚫ *LIVE DINONAKTIFKAN*\n\n🎤 ${s.title}\n🆔 \`${s.id.slice(0,8)}\`${s.admin_alias ? `\n🏷️ ${s.admin_alias}` : ''}\n\n✅ Show ini tidak lagi tampil sebagai LIVE.`;
          }
        }
      }
    } else if (cmd === '/test') {
      const fromGroup = isGroup;
      const testLines = [
        '🧪 *MODE TEST — WEBHOOK OK*',
        '',
        `📱 Nomor: +${phoneNorm}`,
        fromGroup ? `👥 Grup: ${groupId}` : null,
        `🔧 Device: ${deviceNorm || '-'}`,
        `📨 Command: *${text}*`,
        `⏰ Waktu: ${new Date().toLocaleString('id-ID')}`,
        '',
        '✅ Webhook path aktif',
        '✅ Payload diterima & diparse',
        `✅ Admin: ${isBotAdmin ? 'terverifikasi' : 'tidak'}`,
        '',
        '_Tidak ada token/link yang dikirim — ini hanya simulasi._',
      ].filter((l) => l !== null);
      reply = testLines.join('\n');
    }
  }


  const finalReply = reply || '✅ OK';
  const sendResult = await sendAndAudit(admin, {
    phone: phoneNorm,
    message: finalReply,
    inboxId,
    testMode,
    deliverTest,
    command: cmd,
    device: deviceNorm,
    fromMe,
  });

  return { finalReply, sendResult };
  };

  if (!testMode) {
    const background = (async () => {
      await processAndSendReply();
    })().catch(async (e) => {
      const errorMsg = e instanceof Error ? e.message : 'unknown_error';
      await sendAndAudit(admin, {
        phone: phoneNorm,
        message: `⚠️ Command *${cmd}* gagal diproses. ${errorMsg}`,
        inboxId,
        testMode,
        deliverTest,
        command: cmd,
        device: deviceNorm,
        fromMe,
      });
    });

    const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(background);
    else await background;

    return new Response('accepted', { status: 202, headers: corsHeaders });
  }

  const { finalReply, sendResult } = await processAndSendReply();

  if (testMode) {
    return json({ ok: true, phone: phoneNorm, command: cmd, reply: finalReply, delivered: deliverTest, send: sendResult });
  }

  return new Response('ok', { headers: corsHeaders });
});
