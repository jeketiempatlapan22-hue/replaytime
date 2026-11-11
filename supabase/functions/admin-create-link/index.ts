import { primeReplayHost, rewriteReplay } from '../_shared/replay-origin.ts';
// Admin: buat link token BARU (show / replay / membership 1-2 bulan). Tidak pernah menyalin token lama.
import { createAdminLink } from '../_shared/admin-link.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => _json(b && typeof (b as any).message === 'string' ? { ...(b as any), message: rewriteReplay((b as any).message) } : b, s);
const _json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });


Deno.serve(async (req) => {
  await primeReplayHost();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user?.id) return json({ error: 'unauthorized' }, 401);
  const { data: role } = await admin.from('user_roles').select('role').eq('user_id', u.user.id).eq('role', 'admin').maybeSingle();
  if (!role) return json({ error: 'forbidden' }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const r = await createAdminLink(admin, body, 'admin');
  return json(r.body, r.status);
});
