// Dipanggil browser setelah bukti transfer diunggah. Data dibaca ulang dari database
// (tidak mempercayai isi dari browser) lalu dikirim sekali ke Telegram admin.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { notifyProof } from '../_shared/telegram-admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const parsed = z.object({ proof_id: z.string().uuid() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: 'invalid_request' }, 400);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: p } = await admin.from('membership_payment_proofs').select('id,created_at').eq('id', parsed.data.proof_id).maybeSingle();
    // Hanya bukti baru (≤ 30 menit) agar endpoint tidak bisa dipakai mengulang notifikasi lama.
    if (!p || Date.now() - new Date(p.created_at).getTime() > 30 * 60_000) return json({ ok: true, sent: false });
    const sent = await notifyProof(admin, p.id);
    return json({ ok: true, sent });
  } catch (e) {
    console.error('proof-submitted-notify:', String(e));
    return json({ error: 'notify_failed' }, 500);
  }
});
