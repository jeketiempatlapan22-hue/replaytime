// Admin-only diagnostic for the Pakasir webhook. Verifies that:
//  1) PAKASIR_API_KEY + PAKASIR_PROJECT_SLUG are configured server-side.
//  2) The deployed webhook URL accepts a properly-signed payload (returns 404
//     "order not found" for a synthetic order_id — proves auth + routing work
//     without ever marking a real order paid).
//  3) Pakasir's transactiondetail API is reachable from the server.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Admin auth check
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
  }
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: claims } = await userClient.auth.getClaims(auth.slice(7));
  if (!claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: claims.claims.sub, _role: 'admin' });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
  }

  const apiKey = Deno.env.get('PAKASIR_API_KEY') || '';
  const slug = Deno.env.get('PAKASIR_PROJECT_SLUG') || '';
  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const webhookUrl = `${baseUrl}/functions/v1/pakasir-webhook`;

  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  checks.push({ name: 'PAKASIR_API_KEY configured', ok: !!apiKey, detail: apiKey ? 'present' : 'missing — set it in Cloud secrets' });
  checks.push({ name: 'PAKASIR_PROJECT_SLUG configured', ok: !!slug, detail: slug || 'missing — set it in Cloud secrets' });

  // 1) Auth check on webhook with WRONG key — must reject.
  let authReject = { ok: false, status: 0, body: '' };
  try {
    const r = await fetch(webhookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: 'wrong-key-' + Math.random(), project: slug, order_id: 'selftest', amount: 1, status: 'pending' }),
    });
    authReject = { ok: r.status === 401, status: r.status, body: (await r.text()).slice(0, 200) };
  } catch (e) {
    authReject = { ok: false, status: 0, body: 'fetch failed: ' + String(e) };
  }
  checks.push({
    name: 'Webhook rejects invalid api_key',
    ok: authReject.ok,
    detail: authReject.ok ? 'returns 401 as expected' : `expected 401, got ${authReject.status}: ${authReject.body}`,
  });

  // 2) Auth + routing check with REAL key + synthetic order — must return 404 "order not found".
  let routing = { ok: false, status: 0, body: '' };
  if (apiKey) {
    try {
      const fakeOrder = 'selftest_' + Date.now().toString(36);
      const r = await fetch(webhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, project: slug, order_id: fakeOrder, amount: 1, status: 'pending' }),
      });
      const txt = (await r.text()).slice(0, 200);
      routing = { ok: r.status === 404 && txt.includes('order not found'), status: r.status, body: txt };
    } catch (e) {
      routing = { ok: false, status: 0, body: 'fetch failed: ' + String(e) };
    }
  }
  checks.push({
    name: 'Webhook accepts valid signature',
    ok: routing.ok,
    detail: routing.ok ? 'returns 404 for synthetic order — auth + routing OK' : `expected 404 order not found, got ${routing.status}: ${routing.body}`,
  });

  // 3) Pakasir transactiondetail API reachable.
  let pakasirReach = { ok: false, status: 0, body: '' };
  if (apiKey && slug) {
    try {
      const r = await fetch(`https://app.pakasir.com/api/v2/transaction-status/${encodeURIComponent(slug)}/selftest`, { headers: { 'X-Api-Key': apiKey } });
      const txt = (await r.text()).slice(0, 200);
      pakasirReach = { ok: r.ok || r.status === 404, status: r.status, body: txt };
    } catch (e) {
      pakasirReach = { ok: false, status: 0, body: 'fetch failed: ' + String(e) };
    }
  }
  checks.push({
    name: 'Pakasir API reachable from server',
    ok: pakasirReach.ok,
    detail: pakasirReach.ok ? `HTTP ${pakasirReach.status}` : `HTTP ${pakasirReach.status}: ${pakasirReach.body}`,
  });

  const allOk = checks.every(c => c.ok);

  // Persist last verification timestamp + result.
  if (allOk) {
    await admin.from('site_settings').upsert(
      { key: 'pakasir_webhook_verified_at', value: new Date().toISOString() },
      { onConflict: 'key' },
    );
  }

  return new Response(JSON.stringify({ ok: allOk, webhook_url: webhookUrl, checks }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
