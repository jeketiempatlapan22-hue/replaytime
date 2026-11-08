// Admin approves a manual payment proof: force-mark the linked order as paid,
// then delegate to `check-pakasir-status` to finalize (issue token) and send WA.
// Works for both membership_orders (proof.order_id) and show/replay orders (proof.show_order_id).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

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

    const body = await req.json().catch(() => ({}));
    const proofId = String((body as any).proof_id || '');
    if (!proofId) {
      return new Response(JSON.stringify({ error: 'missing proof_id' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: proof, error: pErr } = await admin
      .from('membership_payment_proofs').select('*').eq('id', proofId).maybeSingle();
    if (pErr || !proof) {
      return new Response(JSON.stringify({ error: 'proof_not_found' }), { status: 404, headers: corsHeaders });
    }

    let orderKind: 'membership' | 'show' | null = null;
    let orderIdToPoll: string | null = null;

    // Bukti tanpa order: admin memilih jenis + target, order dibuat di sini.
    const manualKind = String((body as any).kind || '');
    const targetId = String((body as any).target_id || '');
    const manualPhone = String((body as any).phone || proof.phone || '').replace(/\D/g, '');
    const manualEmail = String((body as any).email || proof.email || '');

    if (!proof.order_id && !proof.show_order_id && manualKind && targetId) {
      if (manualKind === 'membership') {
        const { data: pkg } = await admin
          .from('membership_packages').select('id,name,price_idr,pakasir_amount').eq('id', targetId).maybeSingle();
        if (!pkg) {
          return new Response(JSON.stringify({ error: 'package_not_found' }), { status: 404, headers: corsHeaders });
        }
        const { data: mo, error: moErr } = await admin.from('membership_orders').insert({
          package_id: pkg.id,
          user_id: proof.user_id,
          email: manualEmail,
          phone: manualPhone,
          kind: 'qris',
          amount: Number(pkg.pakasir_amount || pkg.price_idr || 0),
          status: 'reserved',
          reserved_until: new Date(Date.now() + 3600_000).toISOString(),
        }).select('id').single();
        if (moErr || !mo) {
          return new Response(JSON.stringify({ error: 'create_membership_order_failed', detail: moErr?.message }), { status: 500, headers: corsHeaders });
        }
        await admin.from('membership_payment_proofs').update({ order_id: mo.id }).eq('id', proof.id);
        proof.order_id = mo.id;
      } else if (manualKind === 'show' || manualKind === 'replay') {
        const isShow = manualKind === 'show';
        const { data: target } = isShow
          ? await admin.from('active_shows').select('id,title,price_show').eq('id', targetId).maybeSingle()
          : await admin.from('replays').select('id,title').eq('id', targetId).maybeSingle();
        if (!target) {
          return new Response(JSON.stringify({ error: 'target_not_found' }), { status: 404, headers: corsHeaders });
        }
        const { data: so, error: soErr } = await admin.from('orders').insert({
          user_id: proof.user_id,
          user_phone: manualPhone,
          show_id: isShow ? targetId : null,
          replay_id: isShow ? null : targetId,
          item_title: (target as any).title || '',
          amount: Number(proof.amount || (target as any).price_show || 0),
          status: 'pending',
          kind: isShow ? 'show' : 'replay_only',
        }).select('id').single();
        if (soErr || !so) {
          return new Response(JSON.stringify({ error: 'create_show_order_failed', detail: soErr?.message }), { status: 500, headers: corsHeaders });
        }
        await admin.from('membership_payment_proofs').update({ show_order_id: so.id }).eq('id', proof.id);
        proof.show_order_id = so.id;
      }
    }

    // Membership branch
    if (proof.order_id) {
      orderKind = 'membership';
      orderIdToPoll = proof.order_id;
      const { data: mo } = await admin
        .from('membership_orders').select('id,status').eq('id', proof.order_id).maybeSingle();
      if (!mo) {
        return new Response(JSON.stringify({ error: 'membership_order_not_found' }), { status: 404, headers: corsHeaders });
      }
      if (mo.status !== 'paid') {
        await admin.from('membership_orders').update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        }).eq('id', mo.id);
      }
    } else if (proof.show_order_id) {
      orderKind = 'show';
      orderIdToPoll = proof.show_order_id;
      const { data: so } = await admin
        .from('orders').select('id,status').eq('id', proof.show_order_id).maybeSingle();
      if (!so) {
        return new Response(JSON.stringify({ error: 'show_order_not_found' }), { status: 404, headers: corsHeaders });
      }
      if (so.status !== 'paid') {
        await admin.from('orders').update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        }).eq('id', so.id);
      }
    } else {
      return new Response(JSON.stringify({ error: 'proof_has_no_order' }), { status: 400, headers: corsHeaders });
    }


    // Delegate finalize + WA send to check-pakasir-status (uses service role internally).
    let finalize: unknown = null;
    try {
      const fnRes = await fetch(`${SUPABASE_URL}/functions/v1/check-pakasir-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({ order_id: orderIdToPoll }),
      });
      finalize = await fnRes.json().catch(() => ({}));
    } catch (e) {
      finalize = { error: String(e) };
    }

    // Mark proof handled regardless — admin explicitly approved it.
    await admin.from('membership_payment_proofs').update({ handled: true }).eq('id', proof.id);

    return new Response(JSON.stringify({
      ok: true,
      order_kind: orderKind,
      order_id: orderIdToPoll,
      finalize,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
