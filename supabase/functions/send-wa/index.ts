import { primeReplayHost, rewriteReplay } from '../_shared/replay-origin.ts';
import { enrichAccessMessage } from '../_shared/group-link.ts';
// Send WhatsApp message via Fonnte. Admin-only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  return d;
}

export async function sendFonnte(phone: string, message: string): Promise<{ ok: boolean; data: unknown }> {
  const groupAdmin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  message = rewriteReplay(await enrichAccessMessage(groupAdmin, message));
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) return { ok: false, data: { error: 'FONNTE_TOKEN not configured' } };
  const target = normalizePhone(phone);
  if (!/^628\d{8,11}$/.test(target)) return { ok: false, data: { error: 'invalid_phone_for_fonnte', target } };
  const form = new FormData();
  form.append('target', target);
  form.append('message', message);
  form.append('countryCode', '62');
  const attempts = [10000];
  let last: { ok: boolean; data: unknown } = { ok: false, data: { error: 'no_attempt' } };
  for (const timeoutMs of attempts) {
    try {
      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: token },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await res.text();
      let data: unknown;
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw: raw.slice(0, 500) }; }
      if (!res.ok && data && typeof data === 'object') {
        data = { ...(data as Record<string, unknown>), http_status: res.status, http_status_text: res.statusText };
      }
      last = { ok: res.ok && (data as { status?: boolean })?.status !== false, data };
      if (last.ok) return last;
    } catch (e) {
      last = { ok: false, data: { error: e instanceof Error ? e.message : String(e) } };
    }
  }
  return last;
}

Deno.serve(async (req) => {
  await primeReplayHost();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: claimErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: claims.claims.sub, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const phone = String(body.phone ?? '').trim();
    const message = String(body.message ?? '').trim();
    const orderId = body.order_id ? String(body.order_id) : null;
    if (!phone || !message) {
      return new Response(JSON.stringify({ error: 'phone and message required' }), { status: 400, headers: corsHeaders });
    }

    const result = await sendFonnte(phone, message);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await admin.from('wa_outbox').insert({
      phone: normalizePhone(phone),
      message,
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : JSON.stringify(result.data),
      related_order_id: orderId,
      fonnte_response: result.data as Record<string, unknown>,
    });

    return new Response(JSON.stringify({ ok: result.ok, data: result.data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
