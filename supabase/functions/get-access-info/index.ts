import { primeReplayHost, rewriteReplay } from '../_shared/replay-origin.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { membershipPasswordOk, currentMembershipPassword } from "../_shared/membership-password.ts";
import { bundleShowTokens } from "../_shared/bundle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, status = 200) => _json(b && typeof (b as any).message === 'string' ? { ...(b as any), message: rewriteReplay((b as any).message) } : b, status);
const _json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function buildMessage(o: {
  title: string; date: string; link: string; password: string; replayInfo: string; kindLabel: string; replayLink?: string;
}) {
  const lines: string[] = [
    "🎬 *RealTime48*",
    "━━━━━━━━━━━━━━",
    "",
    `🎤 *${o.title}*`,
  ];
  if (o.date) lines.push(`📅 ${o.date}`);
  lines.push("", `🔗 *${o.kindLabel}*`, o.link);
  if (o.replayLink) lines.push('', '🎬 *Link Replay:*', o.replayLink);
  if (o.password) lines.push("", `🗝️ *Sandi Replay:* ${o.password}`);
  if (o.replayInfo) lines.push("", "🎞️ *Info Replay*", o.replayInfo);
  lines.push("", "━━━━━━━━━━━━━━", "✨ Selamat menonton! 💖");
  return lines.join("\n");
}

Deno.serve(async (req) => {
  await primeReplayHost();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({} as any));
    const token = String(body.token || "").trim();
    const showId = String(body.show_id || "").trim();
    const replayId = String(body.replay_id || "").trim();
    const mtoken = String(body.mtoken || "").trim();
    const mpassword = String(body.mpassword || "").trim();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await admin
      .from("site_settings").select("key,value").eq("key", "site_origin").maybeSingle();
    const origin = String((settings as any)?.value || "https://realtime48show.my.id").replace(/\/+$/, "");

    // ===== Membership =====
    if (mtoken) {
      const { data: t } = await admin
        .from("membership_tokens")
        .select("id,token,password,password_rotating,label,expires_at,revoked,replay_info,includes_replays")
        .eq("token", mtoken).maybeSingle();
      if (!t || t.revoked) return json({ ok: false, reason: "invalid" });
      if (t.password && mpassword && !(await membershipPasswordOk(admin, t, mpassword))) return json({ ok: false, reason: "invalid" });
      const curPw = await currentMembershipPassword(admin, t);
      const link = `${origin}/live?mtoken=${encodeURIComponent(t.token)}&mp=${encodeURIComponent(curPw)}`;
      const date = t.expires_at
        ? `Berlaku hingga ${new Date(t.expires_at).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`
        : "";
      const password = curPw;
      const replayInfo = String(t.replay_info || "");
      return json({
        ok: true,
        title: t.label || "Membership",
        date,
        link,
        password,
        replay_info: replayInfo,
        message: buildMessage({ title: t.label || "Membership", date, link, password, replayInfo, kindLabel: "Link Membership", replayLink: t.includes_replays ? origin : undefined }),
      });
    }

    if (!token) return json({ ok: false, reason: "no_token" });

    // ===== Bundel Show =====
    {
      const { data: bt } = await admin
        .from("show_bundle_tokens")
        .select("token,password,show_ids,revoked")
        .eq("token", token).maybeSingle();
      if (bt && !bt.revoked) {
        const subTokens = await bundleShowTokens(admin, bt.token);
        const ids = Object.keys(subTokens);
        const { data: rows } = ids.length
          ? await admin.from("active_shows").select("id,title,show_date,replay_id").in("id", ids)
          : { data: [] as any[] };
        const shows = (rows || []).map((s: any) => ({
          id: s.id,
          title: s.title,
          date: s.show_date,
          token: subTokens[s.id],
          link: `${origin}/live?show=${s.id}&t=${subTokens[s.id]}`,
          replay_link: s.replay_id ? `${origin}/akses?token=${subTokens[s.id]}&replay=${s.replay_id}` : "",
        }));
        const link = `${origin}/shows?bt=${bt.token}`;
        const password = String(bt.password || "");
        const title = `Bundel Show (${shows.length} show)`;
        return json({
          ok: true, bundle: true, title, date: "", link, password, replay_info: "",
          shows,
          message: buildMessage({ title, date: "", link, password, replayInfo: "", kindLabel: "Link Bundel" }),
        });
      }
    }

    // ===== Order-based access (show / replay) =====
    const { data: order } = await admin
      .from("orders")
      .select("id,show_id,replay_id,item_title,status,access_token")
      .eq("access_token", token)
      .eq("status", "paid")
      .maybeSingle();

    let okShowId = "";
    let okReplayId = "";

    if (order) {
      okShowId = String(order.show_id || "");
      okReplayId = String(order.replay_id || "");
    } else if (showId) {
      const { data: st } = await admin
        .from("active_show_tokens").select("id,revoked").eq("token", token).eq("show_id", showId).maybeSingle();
      if (st && !st.revoked) okShowId = showId;
    } else if (replayId) {
      const { data: rt } = await admin
        .from("replay_personal_tokens").select("id,revoked").eq("token", token).eq("replay_id", replayId).maybeSingle();
      if (rt && !rt.revoked) okReplayId = replayId;
      if (!okReplayId) {
        // Token show yang shownya sudah dikonversi menjadi replay ini.
        const { data: linked } = await admin
          .from("active_shows").select("id").eq("replay_id", replayId);
        const ids = (linked || []).map((s: any) => s.id);
        if (ids.length) {
          const { data: st } = await admin
            .from("active_show_tokens").select("id,revoked,show_id").eq("token", token).in("show_id", ids).maybeSingle();
          if (st && !st.revoked) okShowId = String(st.show_id);
        }
      }
    }


    if (!okShowId && !okReplayId) return json({ ok: false, reason: "invalid" });

    // Show yang sudah dikonversi/dihapus: pakai replay hasil konversinya supaya
    // pembeli tetap melihat link + sandi replay.
    if (okShowId) {
      const { data: showExists } = await admin
        .from("active_shows").select("id,replay_id").eq("id", okShowId).maybeSingle();
      if (!showExists) {
        if (!okReplayId) {
          const raw = String(order?.item_title || "").replace(/^Show\s*•\s*/i, "").trim();
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
          const firstTwo = (s: string) => norm(s.split(/\s+/).slice(0, 2).join(" "));
          const { data: reps } = await admin
            .from("replays").select("id,title,date").order("date", { ascending: false }).limit(500);
          const list = reps || [];
          const exact = list.find((r: any) => norm(String(r.title)) === norm(raw));
          const loose = exact || list.find((r: any) => firstTwo(String(r.title)) === firstTwo(raw));
          if (loose) okReplayId = String(loose.id);
        }
        if (okReplayId) okShowId = "";
        else return json({ ok: false, reason: "invalid" });
      }
    }

    // Replay purchase
    if (okReplayId && !okShowId) {
      const { data: rep } = await admin
        .from("replays").select("title,date,show_time,password").eq("id", okReplayId).maybeSingle();
      const title = String(rep?.title || order?.item_title || "Replay");
      const d = rep?.date ? String(rep.date) : "";
      const t = String(rep?.show_time || "").slice(0, 5);
      const date = d ? (t ? `${d} ${t}` : d) : "";
      const link = `${origin}/akses?token=${token}&replay=${okReplayId}`;
      const password = String(rep?.password || "");
      return json({
        ok: true, title, date, link, password, replay_info: "",
        message: buildMessage({ title, date, link, password, replayInfo: "", kindLabel: "Link Replay" }),
      });
    }

    // Show purchase
    const { data: show } = await admin
      .from("active_shows")
      .select("title,show_date,show_time,live_password,replay_info,replay_id,group_link,group_link_enabled")
      .eq("id", okShowId).maybeSingle();
    const title = String(show?.title || order?.item_title || "Show");
    const d = show?.show_date ? String(show.show_date) : "";
    const t = String(show?.show_time || "").slice(0, 5);
    const date = d ? (t ? `${d} ${t}` : d) : "";
    const link = `${origin}/live?show=${okShowId}&t=${token}`;
    // Sandi yang ditampilkan = sandi yang diatur admin pada show ini.
    let password = String(show?.live_password || "").trim();
    const replayInfo = String(show?.replay_info || "");

    let replayLink = "";
    if (show?.replay_id) {
      const { data: rep } = await admin
        .from("replays").select("id,password").eq("id", show.replay_id).maybeSingle();
      // Hanya dipakai sebagai cadangan bila admin belum mengisi sandi di show.
      if (!password && rep?.password) password = String(rep.password);
      if (rep?.id) replayLink = `${origin}/akses?token=${token}&replay=${rep.id}`;
    }

    return json({
      ok: true,
      title,
      date,
      link,
      replay_link: replayLink,
      password,
      replay_info: replayInfo,
      group_link: show?.group_link_enabled ? String(show?.group_link || "") : "",
      message: buildMessage({ title, date, link, password, replayInfo, kindLabel: "Link Akses", replayLink: origin }),
    });
  } catch (e) {
    return json({ ok: false, reason: "error", error: String((e as Error)?.message || e) }, 200);
  }
});
