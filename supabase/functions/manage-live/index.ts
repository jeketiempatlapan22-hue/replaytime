import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function cleanSources(sources: unknown) {
  return Array.isArray(sources)
    ? sources.filter((s: any) => s && s.url).map((s: any) => ({
        label: String(s.label || '').slice(0, 80),
        type: ['m3u8', 'youtube', 'cloudflare'].includes(s.type) ? s.type : 'm3u8',
        url: String(s.url || ''),
      }))
    : [];
}

function cleanLineup(lineup: unknown) {
  return Array.isArray(lineup)
    ? lineup.map((n: any) => String(n || '').trim()).filter(Boolean).slice(0, 40)
    : [];
}

function cleanActiveShowPayload(input: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  const textFields = ['title', 'show_date', 'show_time', 'category', 'featured_member', 'description', 'image_url', 'admin_alias', 'live_url', 'live_type', 'live_password', 'replay_m3u8_url', 'replay_youtube_url', 'idn_show_id', 'server2_url', 'group_link', 'group_link_label', 'group_link_note', 'replay_info', 'short_title'];
  const boolFields = ['is_active', 'is_special', 'replay_enabled', 'is_live', 'live_auto_schedule', 'live_require_password', 'replay_mode', 'group_link_enabled'];
  const numberFields = ['sort_order', 'price_show', 'price_replay', 'price_show_coins', 'price_replay_coins', 'pakasir_amount'];

  for (const field of textFields) {
    if (field in input) payload[field] = input[field] == null ? null : String(input[field]).trim();
  }
  for (const field of boolFields) {
    if (field in input) payload[field] = input[field] === true;
  }
  for (const field of numberFields) {
    if (field in input) payload[field] = Number(input[field]) || 0;
  }
  if ('lineup' in input) payload.lineup = cleanLineup(input.lineup);
  if ('live_sources' in input) payload.live_sources = cleanSources(input.live_sources);
  if ('replay_id' in input) payload.replay_id = input.replay_id ? String(input.replay_id) : null;
  if ('live_hold_until' in input) {
    const raw = input.live_hold_until;
    if (!raw) payload.live_hold_until = null;
    else {
      const d = new Date(String(raw));
      payload.live_hold_until = isNaN(d.getTime()) ? null : d.toISOString();
    }
  }
  // Menyalakan live manual otomatis melepas masa tahan
  if (payload.is_live === true && !('live_hold_until' in payload)) payload.live_hold_until = null;
  if ('live_type' in payload && !['m3u8', 'youtube', 'cloudflare'].includes(String(payload.live_type))) payload.live_type = 'm3u8';
  payload.updated_at = new Date().toISOString();
  return payload;

}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: cErr } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    if (cErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", claims.claims.sub).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "get_config") {
      const { data } = await admin.from("live_config_private").select("*").limit(1).maybeSingle();
      return json({ config: data });
    }
    if (action === "set_config") {
      const { enabled, title, type, url, password, require_password, sources, lineup } = body;
      const { data: existing } = await admin.from("live_config_private").select("id").limit(1).maybeSingle();
      const payload: any = { enabled: !!enabled, title: title ?? "Live", type: type ?? "m3u8", url: url ?? "", password: password ?? "", require_password: require_password !== false, sources: cleanSources(sources), lineup: cleanLineup(lineup), updated_at: new Date().toISOString() };
      if (existing) await admin.from("live_config_private").update(payload).eq("id", existing.id);
      else await admin.from("live_config_private").insert(payload);
      return json({ ok: true });
    }
    if (action === "upsert_active_show") {
      const show = (body.show && typeof body.show === 'object' ? body.show : body) as Record<string, unknown>;
      const id = typeof show.id === 'string' ? show.id : typeof body.id === 'string' ? body.id : '';
      const payload = cleanActiveShowPayload(show);
      if (payload.is_live === true) {
        const q = admin.from("active_shows").update({ is_live: false, updated_at: new Date().toISOString() }).eq("is_live", true);
        if (id) await q.neq("id", id);
        else await q;
      }
      if (id) {
        const { error } = await admin.from("active_shows").update(payload).eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, id });
      }
      const { data, error } = await admin.from("active_shows").insert(payload).select("id").single();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, id: data?.id });
    }
    if (action === "delete_active_show") {
      const id = String(body.id || '');
      if (!id) return json({ error: "Missing show id" }, 400);
      const { error } = await admin.from("active_shows").delete().eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
    if (action === "list_tokens") {
      const { data: tokens } = await admin.from("live_tokens").select("*").order("created_at", { ascending: false });
      const { data: devs } = await admin.from("live_token_devices").select("token_id");
      const counts: Record<string, number> = {};
      (devs || []).forEach((d: any) => { counts[d.token_id] = (counts[d.token_id] || 0) + 1; });
      return json({ tokens: (tokens || []).map((t: any) => ({ ...t, devices_used: counts[t.id] || 0 })) });
    }
    if (action === "create_token") {
      const label = (body.label || "").toString().slice(0, 60);
      const max_devices = Math.max(1, Math.min(50, Number(body.max_devices) || 1));
      const token = crypto.randomUUID().replace(/-/g, "");
      const { error } = await admin.from("live_tokens").insert({ token, label, max_devices });
      if (error) return json({ error: error.message }, 500);
      return json({ token });
    }
    if (action === "delete_token") {
      await admin.from("live_token_devices").delete().eq("token_id", body.id);
      await admin.from("live_tokens").delete().eq("id", body.id);
      return json({ ok: true });
    }
    if (action === "revoke_token") {
      await admin.from("live_tokens").update({ revoked: !!body.revoked }).eq("id", body.id);
      return json({ ok: true });
    }
    if (action === "reset_devices") {
      await admin.from("live_token_devices").delete().eq("token_id", body.id);
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
