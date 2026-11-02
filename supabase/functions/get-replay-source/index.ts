import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bundlePasswordValidForReplay } from "../_shared/bundle.ts";
import { findMembershipByPassword, membershipReplayPasswordOk } from "../_shared/membership-password.ts";
import { isRequestBlocked } from "../_shared/user-block.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hideYoutubeFor(supabase: any, req: Request): Promise<boolean> {
  const { data } = await supabase.from("site_settings").select("key,value").in("key", ["hide_youtube_on_main", "replay_origin"]);
  const m = Object.fromEntries(((data || []) as any[]).map((r) => [r.key, String(r.value || "")]));
  if (m.hide_youtube_on_main !== "true") return false;
  const host = (u: string) => { try { return new URL(u).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
  const replayHost = host(m.replay_origin || "");
  const reqHost = host(req.headers.get("origin") || req.headers.get("referer") || "");
  // Website Replay (B) tetap menerima YouTube; selain itu disembunyikan.
  return !(replayHost && reqHost === replayHost);
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { replay_id, password, access_token, browser_id } = body || {};
    if (!replay_id || (!password && !access_token)) {
      return json({ valid: false }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (await isRequestBlocked(supabase, req, { tokens: [access_token], password })) {
      return json({ valid: false, reason: "maintenance", message: "Website dalam perbaikan" }, 403);
    }

    // Brute-force lockout for password attempts (per replay+device)
    const lockId = `replaysrc:${replay_id}:${browser_id || 'anon'}`;
    if (password && !access_token) {
      const { data: lock } = await supabase.rpc('check_login_lock', { _identifier: lockId });
      const row = Array.isArray(lock) ? lock[0] : lock;
      if (row?.locked) return json({ valid: false, reason: 'rate_limited', seconds_remaining: row.seconds_remaining }, 429);
    }

    const { data: replay } = await supabase
      .from("replays")
      .select("password, date, youtube_id, youtube_alt_id, m3u8_url, source_type, sources, access_token")
      .eq("id", replay_id)
      .single();

    if (!replay) return json({ valid: false }, 404);

    let valid = false;
    let memberCred: { token: string; password: string } | null = null;

    if (access_token) {
      // 1) master public token on replay
      if (replay.access_token && replay.access_token === access_token) {
        valid = true;
      } else {
        // 2) personal token — replay tidak lagi dikunci per perangkat
        const { data: pt } = await supabase
          .from("replay_personal_tokens")
          .select("id, replay_id, revoked, expires_at")
          .eq("token", access_token)
          .maybeSingle();
        if (pt && pt.expires_at && new Date(pt.expires_at).getTime() < Date.now()) {
          return json({ valid: false, reason: "expired" }, 403);
        }
        if (pt && !pt.revoked && pt.replay_id === replay_id) {
          valid = true;
        }

        // 3) membership token — berlaku untuk replay yang tanggalnya berada
        // dalam periode membership (starts_at .. expires_at) dan paket
        // membership memang mencakup replay.
        if (!valid) {
          const { data: mt } = await supabase
            .from("membership_tokens")
            .select("id, revoked, starts_at, expires_at, includes_replays, max_devices")
            .eq("token", access_token)
            .maybeSingle();
          if (mt && !mt.revoked) {
            const now = Date.now();
            const startsAt = mt.starts_at ? new Date(mt.starts_at).getTime() : 0;
            const expiresAt = mt.expires_at ? new Date(mt.expires_at).getTime() : Number.POSITIVE_INFINITY;
            if (now > expiresAt) return json({ valid: false, reason: "expired" }, 403);
            if (!mt.includes_replays) return json({ valid: false, reason: "membership_no_replays" }, 403);

            const replayTime = new Date(`${replay.date}T12:00:00Z`).getTime();
            const inPeriod = Number.isFinite(replayTime)
              && replayTime >= (startsAt ? startsAt - 24 * 3600 * 1000 : 0)
              && replayTime <= (Number.isFinite(expiresAt) ? expiresAt : replayTime);
            if (!inPeriod) return json({ valid: false, reason: "outside_membership_period" }, 403);

            // Replay bebas perangkat: cukup catat perangkat aktif bila sudah ada
            // (tanpa membatasi jumlah). Batas perangkat hanya berlaku di Live.
            if (browser_id) {
              const { data: existingDev } = await supabase
                .from("membership_token_devices")
                .select("id").eq("token_id", mt.id).eq("browser_id", browser_id).maybeSingle();
              if (existingDev) {
                await supabase.from("membership_token_devices")
                  .update({ last_seen: new Date().toISOString() }).eq("id", existingDev.id);
              }
            }
            valid = true;
          }
        }

        // 3b) pembelian di website yang langsung menunjuk replay ini
        // (termasuk order show lama yang shownya sudah dipindah ke replay).
        if (!valid) {
          const { data: ordRep } = await supabase
            .from("orders")
            .select("id")
            .eq("access_token", access_token)
            .eq("status", "paid")
            .eq("replay_id", replay_id)
            .maybeSingle();
          if (ordRep) {
            // Pembelian replay bebas perangkat.
            valid = true;
          }
        }

        // 4) token SHOW yang sudah dikonversi jadi replay ini.
        // Link nonton live dan link replay saling terhubung: token show tetap
        // berlaku untuk menonton replay hasil konversinya.
        if (!valid) {
          const { data: linkedShows } = await supabase
            .from("active_shows").select("id").eq("replay_id", replay_id);
          const showIds = (linkedShows || []).map((s: any) => s.id);
          if (showIds.length) {
            // a) pembelian di website (orders) — hanya untuk order legacy yang
            // tidak punya baris di active_show_tokens (yang punya ditangani di (b)).
            const { data: stExists } = await supabase
              .from("active_show_tokens").select("id").eq("token", access_token).maybeSingle();
            const { data: ord } = stExists ? { data: null } : await supabase
              .from("orders")
              .select("id, show_id, status")
              .eq("access_token", access_token)
              .eq("status", "paid")
              .in("show_id", showIds)
              .maybeSingle();
            if (ord) {
              // Replay hasil konversi show: bebas perangkat.
              valid = true;
            }


            // b) token dari Token Factory / reseller (active_show_tokens)
            if (!valid) {
              const { data: st } = await supabase
                .from("active_show_tokens")
                .select("id, revoked, expires_at, show_id")
                .eq("token", access_token)
                .in("show_id", showIds)
                .maybeSingle();
              if (st && !st.revoked) {
                if (st.expires_at && new Date(st.expires_at).getTime() < Date.now()) {
                  return json({ valid: false, reason: "expired" }, 403);
                }
                // Replay bebas perangkat (batas perangkat tetap di halaman Live).
                valid = true;
              }
            }
          }
        }
      }


    } else if (password) {
      valid = !!replay.password && replay.password === password;
      if (!valid) {
        // Sandi bundel show — berlaku untuk semua replay hasil show di bundel.
        valid = await bundlePasswordValidForReplay(supabase, replay_id, password);
      }
      if (!valid) {
        // Sandi master bulanan: terima master bulan replay DAN master bulan berjalan.
        const months = new Set<string>();
        const addMonth = (dt: Date) => {
          if (!isNaN(dt.getTime())) months.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
        };
        addMonth(new Date(replay.date));
        addMonth(new Date(Date.now() + 7 * 3600 * 1000));
        const { data: masters } = await supabase
          .from("master_passwords")
          .select("password, paused, month")
          .in("month", [...months]);
        valid = (masters || []).some((m: any) => m.paused !== true && m.password === password);
      }
      if (!valid) {
        // Sandi membership per user (admin/reseller/QRIS) — lama maupun baru.
        let viaMember = await membershipReplayPasswordOk(supabase, password, replay.date);
        const mt = await findMembershipByPassword(supabase, password);
        if (mt && mt.includes_replays) {
          const startsAt = mt.starts_at ? new Date(mt.starts_at).getTime() : 0;
          const expiresAt = mt.expires_at ? new Date(mt.expires_at).getTime() : Number.POSITIVE_INFINITY;
          const replayTime = new Date(`${replay.date}T12:00:00+07:00`).getTime();
          const inPeriod = Number.isFinite(replayTime)
            && replayTime >= (startsAt ? startsAt - 24 * 3600 * 1000 : 0)
            && replayTime <= expiresAt + 24 * 3600 * 1000;
          if (inPeriod) viaMember = true;
          // Simpan kredensial di perangkat agar live & replay lain terbuka otomatis.
          memberCred = { token: String(mt.token), password: String(password).trim().toUpperCase() };
        }
        valid = viaMember;
        if (!valid && memberCred) {
          await supabase.rpc('record_login_attempt', { _identifier: lockId, _success: true });
          return json({ valid: false, reason: "outside_membership_period", membership: memberCred }, 403);
        }
      }
    }

    if (!valid) {
      if (password && !access_token) {
        await supabase.rpc('record_login_attempt', { _identifier: lockId, _success: false });
      }
      return json({ valid: false }, 403);
    }
    if (password && !access_token) {
      await supabase.rpc('record_login_attempt', { _identifier: lockId, _success: true });
    }

    // Auto-flag replay tanpa sumber video → masuk menu "Replay Off" di admin panel.
    const hasSources = Array.isArray(replay.sources) && replay.sources.length > 0;
    const hasYt = String(replay.youtube_id || "").trim() !== "";
    const hasUrl = String(replay.m3u8_url || "").trim() !== "";
    const markOffline = async (reason: string) => {
      await supabase.from("replays").update({
        is_offline: true,
        offline_reason: reason,
        offline_at: new Date().toISOString(),
      }).eq("id", replay_id);
    };

    if (!hasSources && !hasYt && !hasUrl) {
      await markOffline("Sumber video kosong / tidak tersedia");
      return json({ valid: false, reason: "source_unavailable" }, 404);
    }

    // Jangan melakukan pemeriksaan oEmbed YouTube di jalur buka player.
    // Pemeriksaan jaringan ini dapat menunggu hingga beberapa detik dan membuat
    // UI tampak loading terus. Ketersediaan video ditangani scan-replay-sources.

    // Admin bisa menyembunyikan sumber YouTube di website utama (Website A) agar
    // ID YouTube tidak pernah sampai ke penonton di sana. Website Replay (B) tetap normal.
    let sources = Array.isArray(replay.sources) ? replay.sources : [];
    let ytId = replay.youtube_id || "";
    let ytAlt = (replay as any).youtube_alt_id || "";
    if (await hideYoutubeFor(supabase, req)) {
      sources = sources.filter((s: any) => String(s?.type || "").toLowerCase() !== "youtube" && !/youtu\.?be/i.test(String(s?.url || "")));
      ytId = ""; ytAlt = "";
      if (!sources.length && !String(replay.m3u8_url || "").trim()) {
        return json({ valid: false, reason: "source_hidden" }, 403);
      }
    }

    return json({
      valid: true,
      youtube_id: ytId,
      youtube_alt_id: ytAlt,
      m3u8_url: replay.m3u8_url || "",
      source_type: replay.source_type || "youtube",
      sources,
      ...(memberCred ? { membership: memberCred } : {}),
    });

  } catch {
    return json({ valid: false }, 500);
  }
});
