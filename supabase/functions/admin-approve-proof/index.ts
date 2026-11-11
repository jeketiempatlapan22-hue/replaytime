// Admin approves a manual payment proof: force-mark the linked order as paid,
// then delegate to `check-pakasir-status` to finalize (issue token) and send WA.
// Works for both membership_orders (proof.order_id) and show/replay orders (proof.show_order_id).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { runProofAction } from '../_shared/proof-actions.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

    // Verify caller is admin using their JWT.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const jwt = authHeader.replace('Bearer ', '');
    const { data: claims } = await userClient.auth.getClaims(jwt);
    const uid = claims?.claims?.sub;
    if (!uid) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: roleRow } = await userClient
      .from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
    }

    const parsed = z.object({
      proof_id: z.string().uuid(), action: z.enum(['approve', 'reject', 'reset', 'message']).default('approve'),
      kind: z.enum(['membership', 'show', 'replay']).optional(), target_id: z.string().uuid().optional(),
      phone: z.string().max(30).optional(), email: z.string().max(254).optional(),
    }).safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: corsHeaders });
    const body = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const r = await runProofAction(admin, body);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
