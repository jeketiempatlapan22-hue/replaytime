import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { checkWaNumber } from '../_shared/wa-check.ts';

function normalizePhone(p: string) {
  let s = String(p || '').replace(/\D/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  else if (s.startsWith('8')) s = '62' + s;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const parsed = z.object({ phone: z.string().min(6).max(30) }).safeParse(await req.json().catch(() => ({})));
  const h = { ...corsHeaders, 'Content-Type': 'application/json' };
  if (!parsed.success) return new Response(JSON.stringify({ status: 'invalid' }), { status: 400, headers: h });
  const phone = normalizePhone(parsed.data.phone);
  if (!/^628\d{8,11}$/.test(phone)) return new Response(JSON.stringify({ status: 'invalid', phone }), { headers: h });
  const status = await checkWaNumber(phone);
  return new Response(JSON.stringify({ status, phone }), { headers: h });
});
