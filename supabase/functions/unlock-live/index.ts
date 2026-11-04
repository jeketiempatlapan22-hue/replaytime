import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GRANT_TTL_FREE, signGrant } from "../_shared/stream-grant.ts";
import { findMembershipByPassword, membershipPasswordOk } from "../_shared/membership-password.ts";
import { bundlePasswordValidForShow } from "../_shared/bundle.ts";
import { isRequestBlocked } from "../_shared/user-block.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function bindMembershipDevice(supabase: any, tokenRow: any, browser_id: string, isSilent = false) {
  if (!browser_id || browser_id.length < 6) return { ok: false, reason: "no_device" };
  const max = Math.max(1, Number(tokenRow.max_devices) || 1);
  const isMulti = max > 1;
  const { data: existing } = await supabase
    .from("membership_token_devices").select("id").eq("token_id", tokenRow.id).eq("browser_id", browser_id).maybeSingle();
  if (existing) {
    if (max === 1) {
      // Membership 1-perangkat: buang ikatan perangkat lain yang tersisa.
      await supabase.from("membership_token_devices")
        .delete().eq("token_id", tokenRow.id).neq("browser_id", browser_id);
    }
    await supabase.from("membership_token_devices").update({ last_seen: new Date().toISOString() }).eq("id", existing.id);
    return { ok: true };
  }

  const { count } = await supabase
    .from("membership_token_devices").select("id", { count: "exact", head: true }).eq("token_id", tokenRow.id);
  if ((count || 0) >= max) {
    if (isMulti && isSilent) return { ok: true, soft: true };
    return { ok: false, reason: "device_limit" };
  }
  const { error } = await supabase.from("membership_token_devices").insert({ token_id: tokenRow.id, browser_id });
  if (error) {
    const { data: re } = await supabase
      .from("membership_token_devices").select("id").eq("token_id", tokenRow.id).eq("browser_id", browser_id).maybeSingle();
    if (!re) {
      if (isMulti && isSilent) return { ok: true, soft: true };
      return { ok: false, reason: "device_limit" };
    }
  }
  return { ok: true };
}

function membershipInfo(t: any) {
  const max = t.manual_resets_max || 3;
  const used = t.manual_resets_used || 0;
  return { expires_at: t.expires_at, resets_used: used, resets_max: max, remaining: Math.max(0, max - used), includes_replays: !!t.includes_replays, max_devices: t.max_devices || 1 };
}

async function verifyMembership(supabase: any, mtoken: string, mpassword: string, browser_id: string, isSilent = false) {
  const { data: t } = await supabase
    .from("membership_tokens").select("*").eq("token", mtoken).maybeSingle();
  if (!t || t.revoked) return { ok: false, reason: "revoked" };
  if (!(await membershipPasswordOk(supabase, t, mpassword))) return { ok: false, reason: "bad_membership_password" };
  const now = Date.now();
  if (t.expires_at && new Date(t.expires_at).getTime() < now) return { ok: false, reason: "expired" };
  // Tanggal mulai di masa depan tidak lagi memblokir akses live (member boleh langsung masuk).
  // Per-package pause check
  if (t.package_id) {
    const { data: pkg } = await supabase
      .from("membership_packages").select("paused,pause_message,name").eq("id", t.package_id).maybeSingle();
    if (pkg?.paused) {
      return { ok: false, reason: "membership_paused", pause_message: String(pkg.pause_message || ''), package_name: String(pkg.name || '') };
    }
  }
  const bind = await bindMembershipDevice(supabase, t, browser_id, isSilent);
  if (!bind.ok) return bind;
  return { ok: true, token: t, soft: !!bind.soft };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({} as any));
    const { token, password, browser_id, show_id, silent, admin_monitor } = body;
    let { mtoken, mpassword } = body;
    const isSilent = silent === true;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (browser_id) {
      const { data: blk } = await supabase
        .from("blocked_browsers").select("id,unblocked").eq("browser_id", browser_id).eq("unblocked", false).maybeSingle();
      if (blk) return json({ valid: false, reason: "blocked" });
    }

    if (admin_monitor !== true && await isRequestBlocked(supabase, req, { tokens: [token, mtoken], password: password || mpassword })) {
      return json({ valid: false, reason: "maintenance", message: "Website dalam perbaikan" });
    }

    // Sandi membership per user diketik langsung (tanpa link): ubah jadi jalur token membership.
    let memberCred: { membership_token: string; membership_password: string } | null = null;
    if (!mtoken && !token && password && admin_monitor !== true) {
      const mt = await findMembershipByPassword(supabase, String(password));
      if (mt) {
        mtoken = String(mt.token);
        mpassword = String(password).trim().toUpperCase();
        memberCred = { membership_token: mtoken, membership_password: mpassword };
      }
    }

    // ===== Priority: Membership token verification (works regardless of whether a live show is currently running) =====
    // This ensures every membership link (admin/reseller/QRIS/coin) is accepted as long as the token itself is valid.
    if (mtoken) {
      const r = await verifyMembership(supabase, mtoken, mpassword || "", browser_id || "", isSilent);
      if (!r.ok) {
        return json({ valid: false, reason: r.reason, pause_message: (r as any).pause_message, package_name: (r as any).package_name, ...(memberCred || {}) });
      }
      // Try to enrich with the currently-live show; otherwise fall back to nearest upcoming/active show; otherwise legacy live_config_private.
      let payload: any = null;
      const { data: liveShow } = await supabase
        .from("active_shows")
        .select("id,title,is_live,live_url,live_type,live_sources,show_date,show_time,idn_show_id,server2_url")
        .eq("is_active", true).eq("is_live", true)
        .order("show_date", { ascending: false }).order("show_time", { ascending: false })
        .limit(1).maybeSingle();
      if (liveShow) {
        payload = {
          valid: true, enabled: true, title: liveShow.title, type: liveShow.live_type || "m3u8",
          url: liveShow.live_url || "",
          sources: Array.isArray(liveShow.live_sources) ? liveShow.live_sources : [],
          show_date: liveShow.show_date, show_time: liveShow.show_time,
          idn_show_id: liveShow.idn_show_id || "",
          server2_url: liveShow.server2_url || "",
          show_id: liveShow.id,
        };
      } else {
        // Jangan menempel ke show lama yang sudah selesai: ambil show aktif
        // TERDEKAT yang belum lewat (hari ini ke depan) secara menaik.
        const todayWib = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
        let { data: upcoming } = await supabase
          .from("active_shows")
          .select("id,title,live_type,live_sources,show_date,show_time,idn_show_id,server2_url")
          .eq("is_active", true)
          .gte("show_date", todayWib)
          .order("show_date", { ascending: true }).order("show_time", { ascending: true })
          .limit(1).maybeSingle();
        if (!upcoming) {
          const { data: latest } = await supabase
            .from("active_shows")
            .select("id,title,live_type,live_sources,show_date,show_time,idn_show_id,server2_url")
            .eq("is_active", true)
            .order("show_date", { ascending: false }).order("show_time", { ascending: false })
            .limit(1).maybeSingle();
          upcoming = latest;
        }
        if (upcoming) {
          payload = {
            valid: true, enabled: false, title: upcoming.title, type: upcoming.live_type || "m3u8",
            url: "", sources: Array.isArray(upcoming.live_sources) ? upcoming.live_sources : [],
            show_date: upcoming.show_date, show_time: upcoming.show_time,
            idn_show_id: upcoming.idn_show_id || "",
            server2_url: upcoming.server2_url || "",
            show_id: upcoming.id,
          };
        } else {
          const { data: cfg } = await supabase.from("live_config_private").select("*").limit(1).maybeSingle();
          payload = {
            valid: true, enabled: !!cfg?.enabled,
            title: cfg?.title || "Membership", type: cfg?.type || "m3u8",
            url: cfg?.url || "",
            sources: Array.isArray(cfg?.sources) ? cfg!.sources : [],
          };
        }
      }
      const mGrant = await signGrant({
        sid: String(payload?.show_id || ""),
        idn: String(payload?.idn_show_id || ""),
        bid: String(browser_id || ""),
        kind: "membership",
        tid: String(r.token?.id || ""),
      });
      return json({ ...payload, ...(memberCred || {}), grant: mGrant, watermark: `MB-${String(mtoken).slice(-4).toUpperCase()}`, membership: membershipInfo(r.token), soft: r.soft });
    }


    // ===== Branch A: per-show live (active_shows) =====
    // If no show_id provided, auto-resolve to the currently-live active show
    // so master/per-show passwords still work from the generic /kunci page.
    let resolvedShowId = show_id as string | undefined;
    if (!resolvedShowId) {
      const { data: liveShow } = await supabase
        .from("active_shows")
        .select("id")
        .eq("is_active", true)
        .eq("is_live", true)
        .order("show_date", { ascending: false })
        .order("show_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (liveShow?.id) resolvedShowId = liveShow.id;
      if (!resolvedShowId) {
        // Fallback: show dengan auto schedule yang sudah masuk window (15 menit sebelum jadwal).
        const { data: autoShow } = await supabase.rpc("get_active_live");
        const row = Array.isArray(autoShow) ? autoShow[0] : autoShow;
        if (row?.id) resolvedShowId = row.id as string;
      }
    }

    if (resolvedShowId) {
      const { data: show } = await supabase
        .from("active_shows")
        .select("id,title,is_live,live_auto_schedule,live_url,live_type,live_sources,live_password,live_require_password,show_date,show_time,is_active,idn_show_id,server2_url,replay_id")
        .eq("id", resolvedShowId).maybeSingle();
      if (!show || !show.is_active) {
        if (show_id) return json({ valid: false, reason: "off" });
        // fall through to legacy branch
      } else {

      // Auto schedule hanya berlaku saat toggle admin diaktifkan.
      const autoLiveNow = (() => {
        if (!show.live_auto_schedule) return false;
        if (!show.show_date || !show.show_time) return false;
        const startMs = new Date(`${show.show_date}T${String(show.show_time).slice(0, 8)}+07:00`).getTime();
        if (!Number.isFinite(startMs)) return false;
        const now = Date.now();
        return now >= startMs - 20 * 60 * 1000 && now <= startMs + 8 * 3600 * 1000;
      })();
      const enabled = !!show.is_live || autoLiveNow;
      const okPayload = {
        valid: true, enabled, title: show.title, type: show.live_type || "m3u8",
        url: show.live_url || "",
        sources: Array.isArray(show.live_sources) ? show.live_sources : [],
        show_date: show.show_date, show_time: show.show_time,
        idn_show_id: show.idn_show_id || "",
        server2_url: show.server2_url || "",
        grant: "",
        watermark: `RT-${String(show.id).slice(0, 4).toUpperCase()}`,
      };

      // Monitor Live admin: verifikasi peran admin dari JWT, tanpa ikatan perangkat.
      if (admin_monitor === true) {
        const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        let isAdm = false;
        if (auth) {
          const { data: u } = await supabase.auth.getUser(auth);
          if (u?.user?.id) {
            const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
            isAdm = !!r;
          }
        }
        if (!isAdm) return json({ valid: false, reason: "unauthorized" });
        const aGrant = await signGrant({ sid: String(show.id), idn: String(show.idn_show_id || ""), bid: String(browser_id || "admin"), kind: "password" });
        return json({ ...okPayload, show_id: show.id, grant: aGrant, watermark: "ADMIN" });
      }


      // Membership bypass
      if (mtoken) {
        const r = await verifyMembership(supabase, mtoken, mpassword || "", browser_id || "", isSilent);
        if (!r.ok) return json({ valid: false, reason: r.reason, pause_message: (r as any).pause_message, package_name: (r as any).package_name });
        const bGrant = await signGrant({
          sid: String(show.id),
          idn: String(show.idn_show_id || ""),
          bid: String(browser_id || ""),
          kind: "membership",
          tid: String(r.token?.id || ""),
        });
        return json({ ...okPayload, grant: bGrant, watermark: `MB-${String(mtoken).slice(-4).toUpperCase()}`, membership: membershipInfo(r.token), soft: r.soft });
      }


      if (token) {
        // Look up by token alone first to distinguish wrong_show vs revoked/missing.
        const { data: t } = await supabase
          .from("active_show_tokens").select("*").eq("token", token).maybeSingle();
        if (!t) return json({ valid: false, reason: "token_not_found" });
        if (t.revoked) return json({ valid: false, reason: "revoked" });
        if (t.show_id !== resolvedShowId) return json({ valid: false, reason: "wrong_show" });
        if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) {
          return json({ valid: false, reason: "expired", expires_at: t.expires_at });
        }
        if (!browser_id) return json({ valid: false, reason: "no_device" });
        // Single-use enforcement: only the first device may bind. Subsequent devices are rejected.
        if (t.single_use && t.used_at && t.used_by_browser_id && t.used_by_browser_id !== browser_id) {
          return json({ valid: false, reason: "single_use_consumed", used_at: t.used_at });
        }
        const { data: existing } = await supabase
          .from("active_show_token_devices").select("id").eq("token_id", t.id).eq("browser_id", browser_id).maybeSingle();
        if (existing && (t.max_devices || 1) === 1) {
          // Token 1-perangkat: pastikan hanya ada satu ikatan perangkat.
          await supabase.from("active_show_token_devices")
            .delete().eq("token_id", t.id).neq("browser_id", browser_id);
        }
        if (!existing) {

          const { count } = await supabase
            .from("active_show_token_devices").select("id", { count: "exact", head: true }).eq("token_id", t.id);
          const isMulti = (t.max_devices || 1) > 1;
          if ((count || 0) >= t.max_devices) {
            // Multi-device/public token: don't kick already-connected user during silent revalidation.
            if (isMulti && isSilent) {
              return json({ ...okPayload, grant: await signGrant({ sid: String(show.id), idn: String(show.idn_show_id || ""), bid: String(browser_id || ""), kind: "show", tid: String(t.id) }), watermark: `RT-${String(token).slice(-4).toUpperCase()}`, token_kind: t.kind || 'personal', max_devices: t.max_devices || 1, soft: true });
            }
            return json({ valid: false, reason: "device_limit" });
          }
          await supabase.from("active_show_token_devices").insert({ token_id: t.id, browser_id });
          // Mark single_use consumption on first successful bind (atomic guard via WHERE used_at IS NULL).
          if (t.single_use && !t.used_at) {
            await supabase.from("active_show_tokens")
              .update({ used_at: new Date().toISOString(), used_by_browser_id: browser_id })
              .eq("id", t.id).is("used_at", null);
          }
        }
        const tGrant = await signGrant({ sid: String(show.id), idn: String(show.idn_show_id || ""), bid: String(browser_id || ""), kind: "show", tid: String(t.id) });
        return json({ ...okPayload, grant: tGrant, watermark: `RT-${String(token).slice(-4).toUpperCase()}`, token_kind: t.kind || 'personal', max_devices: t.max_devices || 1, expires_at: t.expires_at || null, single_use: !!t.single_use });
      }

      if (show.live_require_password) {
        if (!password) return json({ valid: false, reason: "password_or_token_required" });
        const lockId = `livepw:${resolvedShowId}:${browser_id || 'anon'}`;
        const { data: lock } = await supabase.rpc('check_login_lock', { _identifier: lockId });
        const lockRow = Array.isArray(lock) ? lock[0] : lock;
        if (lockRow?.locked) return json({ valid: false, reason: 'rate_limited', seconds_remaining: lockRow.seconds_remaining });
        const pwNorm = String(password).trim().toUpperCase();
        const same = (a: unknown) => !!a && String(a).trim().toUpperCase() === pwNorm;
        let valid = same(show.live_password);
        if (!valid && (show as any).replay_id) {
          // Sandi replay buatan admin untuk show ini juga membuka live show yang sama.
          const { data: rp } = await supabase.from("replays").select("password").eq("id", (show as any).replay_id).maybeSingle();
          valid = same(rp?.password);
        }
        if (!valid) {
          // Sandi master bulanan: terima master bulan show DAN master bulan berjalan.
          const months = new Set<string>();
          const addMonth = (dt: Date) => {
            if (!isNaN(dt.getTime())) months.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
          };
          if (show.show_date) addMonth(new Date(show.show_date));
          addMonth(new Date(Date.now() + 7 * 3600 * 1000));
          const { data: masters } = await supabase
            .from("master_passwords").select("password,paused,month").in("month", [...months]);
          valid = (masters || []).some((m: any) => m.paused !== true && same(m.password));
        }
        if (!valid) {
          // Sandi bundel show (huruf besar/kecil sama) untuk show yang ada di bundelnya.
          valid = await bundlePasswordValidForShow(supabase, String(show.id), String(password));
        }
        await supabase.rpc('record_login_attempt', { _identifier: lockId, _success: valid });
        if (!valid) return json({ valid: false, reason: "bad_password" });
      }
      // Jalur sandi (sandi show / master): tetap dapat grant, tapi berumur pendek
      // (30 menit) dan divalidasi ulang tiap request oleh idn-stream-token.
      const pwGrant = await signGrant({
        sid: String(show.id),
        idn: String(show.idn_show_id || ""),
        bid: String(browser_id || ""),
        kind: "password",
      }, GRANT_TTL_FREE);
      return json({ ...okPayload, grant: pwGrant });
      }
    }

    // ===== Branch B: legacy live_config_private =====
    const { data: cfg } = await supabase.from("live_config_private").select("*").limit(1).maybeSingle();
    if (!cfg) return json({ valid: false, reason: "off" });
    const enabled = !!cfg.enabled;

    if (mtoken) {
      const r = await verifyMembership(supabase, mtoken, mpassword || "", browser_id || "", isSilent);
      if (!r.ok) return json({ valid: false, reason: r.reason, pause_message: (r as any).pause_message, package_name: (r as any).package_name });

      return json({
        valid: true, enabled, title: cfg.title, type: cfg.type, url: cfg.url,
        sources: Array.isArray(cfg.sources) ? cfg.sources : [],
        watermark: `MB-${String(mtoken).slice(-4).toUpperCase()}`,
        membership: membershipInfo(r.token),
        soft: r.soft,
      });
    }

    if (!token && !password) return json({ valid: false, reason: "password_or_token_required" });

    if (token) {
      const { data: t } = await supabase.from("live_tokens").select("*").eq("token", token).maybeSingle();
      if (!t || t.revoked) return json({ valid: false, reason: "revoked" });
      if (!browser_id) return json({ valid: false, reason: "no_device" });
      const { data: existing } = await supabase
        .from("live_token_devices").select("id").eq("token_id", t.id).eq("browser_id", browser_id).maybeSingle();
      const isMulti = (t.max_devices || 1) > 1;
      const okBody = {
        valid: true, enabled, title: cfg.title, type: cfg.type, url: cfg.url,
        sources: Array.isArray(cfg.sources) ? cfg.sources : [],
        watermark: `RT-${String(token).slice(-4).toUpperCase()}`,
        token_kind: isMulti ? 'public' : 'personal',
        max_devices: t.max_devices || 1,
      };
      if (!existing) {
        const { count } = await supabase
          .from("live_token_devices").select("id", { count: "exact", head: true }).eq("token_id", t.id);
        if ((count || 0) >= t.max_devices) {
          if (isMulti && isSilent) return json({ ...okBody, soft: true });
          return json({ valid: false, reason: "device_limit" });
        }
        const { error: insErr } = await supabase.from("live_token_devices").insert({ token_id: t.id, browser_id });
        if (insErr) {
          const { data: re } = await supabase
            .from("live_token_devices").select("id").eq("token_id", t.id).eq("browser_id", browser_id).maybeSingle();
          if (!re) {
            if (isMulti && isSilent) return json({ ...okBody, soft: true });
            return json({ valid: false, reason: "device_limit" });
          }
        }
      }
      return json(okBody);
    }

    if (password) {
      const lockId = `livepwlegacy:${browser_id || 'anon'}`;
      const { data: lock } = await supabase.rpc('check_login_lock', { _identifier: lockId });
      const lockRow = Array.isArray(lock) ? lock[0] : lock;
      if (lockRow?.locked) return json({ valid: false, reason: 'rate_limited', seconds_remaining: lockRow.seconds_remaining });
      let valid = !!cfg.password && cfg.password === password;
      if (!valid) {
        const now = new Date(Date.now() + 7 * 3600 * 1000);
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const { data: masters } = await supabase
          .from("master_passwords").select("password,paused").eq("month", monthKey);
        valid = (masters || []).some((m: any) => m.paused !== true && m.password === password);
      }
      await supabase.rpc('record_login_attempt', { _identifier: lockId, _success: valid });
      if (!valid) return json({ valid: false, reason: "bad_password" });
      return json({
        valid: true, enabled, title: cfg.title, type: cfg.type, url: cfg.url,
        sources: Array.isArray(cfg.sources) ? cfg.sources : [],
        watermark: "RT-PWD",
      });
    }

    return json({ valid: false });
  } catch {
    return json({ valid: false }, 500);
  }
});
