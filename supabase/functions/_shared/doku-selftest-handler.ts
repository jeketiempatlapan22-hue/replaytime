import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { dokuConfiguration, testDokuConnection } from './doku.ts';
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const url = Deno.env.get('SUPABASE_URL') || '';
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: user } = await admin.auth.getUser(jwt);
  if (!user.user) return reply(401, { error: 'unauthorized' });
  const { data: allowed } = await admin.rpc('has_role', { _user_id: user.user.id, _role: 'admin' });
  if (!allowed) return reply(403, { error: 'forbidden' });
  const config = dokuConfiguration();
  const checks = [{ name: 'Pengaturan DOKU', ok: config.configured, detail: config.configured ? 'Tersimpan aman' : 'Belum lengkap: ' + config.missing.join(', ') }];
  let connected = false;
  if (config.configured) { try { await testDokuConnection(); connected = true; } catch { /* no credential or token output */ } }
  checks.push({ name: 'Koneksi DOKU', ok: connected, detail: connected ? 'Otorisasi berhasil' : 'Belum terhubung' });
  checks.push({ name: 'Pembayaran live', ok: connected && config.environment === 'production', detail: config.environment === 'production' ? 'Mode live' : 'Mode test — tidak menerbitkan akses atau koin' });
  // Connection test is not a webhook verification or end-to-end payment test.
  return reply(200, { ok: checks.every(c => c.ok), environment: config.environment, checks });
});