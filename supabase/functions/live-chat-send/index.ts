import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const tail6 = (s: string) => (s || "").slice(-6);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const show_id = typeof body.show_id === "string" && body.show_id ? body.show_id : null;
    const name = String(body.name || "").trim().slice(0, 40);
    const message = String(body.message || "").trim().slice(0, 500);
    const reply_to_id = typeof body.reply_to_id === "string" && body.reply_to_id ? body.reply_to_id : null;
    const browser_id = String(body.browser_id || "").slice(0, 128);
    // Kredensial akses yang sedang dipakai penonton (opsional, untuk identitas pengirim)
    const credToken = String(body.token || "").trim();    // token show / order (QRIS)
    const credMtoken = String(body.mtoken || "").trim();  // token membership
    const credBtoken = String(body.btoken || "").trim();  // token bundel
    const credPw = String(body.pw || "").trim();          // sandi

    if (!message) return json({ ok: false, error: "Pesan kosong" }, 400);
    if (!browser_id) return json({ ok: false, error: "browser_id wajib" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ ok: false, error: "Layanan chat belum tersedia" }, 503);
    const supabase = createClient(url, key);

    // Tolak browser yang diblokir
    const { data: blocked } = await supabase
      .from("chat_blocks").select("id").eq("browser_id", browser_id).maybeSingle();
    if (blocked) return json({ ok: false, error: "Kamu diblokir dari live chat." }, 403);

    // Identitas login (jika ada sesi): tentukan peran admin / moderator
    let userId: string | null = null;
    let senderRole = "user";
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (jwt && anonKey && jwt !== anonKey) {
      const { data: userData } = await supabase.auth.getUser(jwt);
      const uid = userData?.user?.id;
      if (uid) {
        userId = uid;
        const { data: roles } = await supabase
          .from("user_roles").select("role").eq("user_id", uid);
        const roleList = (roles || []).map((r: any) => r.role);
        if (roleList.includes("admin")) senderRole = "admin";
        else if (roleList.includes("moderator")) senderRole = "moderator";
      }
    }

    // Cari pemilik akses untuk identitas privat pengirim
    let phone = "";
    let tokenTail = "";
    let tokenKind = "";
    let createdBy = "";

    if (credMtoken && !credToken && !credBtoken) {
      const { data: mt } = await supabase
        .from("membership_tokens").select("phone, token, created_by")
        .eq("token", credMtoken).eq("revoked", false).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (mt) {
        phone = mt.phone || "";
        tokenTail = tail6(mt.token);
        tokenKind = "membership";
        createdBy = mt.created_by || "";
      }
    }
    if (!tokenKind && credBtoken) {
      const { data: bt } = await supabase
        .from("show_bundle_tokens").select("phone, token")
        .eq("token", credBtoken).eq("revoked", false).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (bt) {
        phone = bt.phone || "";
        tokenTail = tail6(bt.token);
        tokenKind = "bundle";
        createdBy = "pembelian";
      }
    }
    if (!tokenKind && credToken) {
      const { data: ord } = await supabase
        .from("orders").select("user_phone, access_token")
        .eq("access_token", credToken).eq("status", "paid").maybeSingle();
      if (ord) {
        phone = ord.user_phone || "";
        tokenTail = tail6(ord.access_token || "");
        tokenKind = "order";
        createdBy = "pembelian";
      } else {
        const { data: st } = await supabase
          .from("active_show_tokens").select("token, label, revoked, expires_at, show_id")
          .eq("token", credToken).maybeSingle();
        if (st && !st.revoked && (!st.expires_at || new Date(st.expires_at).getTime() > Date.now()) && (!show_id || st.show_id === show_id)) {
          tokenTail = tail6(st.token);
          tokenKind = "show";
          createdBy = st.label || "";
          // A reseller's delivery phone belongs to the reseller, not necessarily the viewer.
          if (!st.label?.startsWith("reseller:")) {
            const { data: delivery } = await supabase.from("token_deliveries")
              .select("phone").eq("access_token", st.token).eq("source", "purchase")
              .order("sent_at", { ascending: false }).limit(1).maybeSingle();
            phone = delivery?.phone || "";
          }
        }
      }
    }
    if (!tokenKind && credPw) {
      tokenKind = "password";
    }
    if (!phone && userId) {
      const { data: prof } = await supabase
        .from("profiles").select("phone").eq("user_id", userId).maybeSingle();
      if (prof?.phone) phone = prof.phone;
    }
    if (!tokenKind) tokenKind = "guest";

    const finalName = senderRole === "admin" ? (name || "Admin") : (name || "Anonim");

    const { data: inserted, error: insErr } = await supabase.rpc("service_send_live_chat", {
      _message: {
        browser_id,
        name: finalName,
        message,
        is_admin: senderRole === "admin",
        pinned: false,
        reply_to_id,
        show_id,
        sender_role: senderRole,
        user_id: userId,
      },
      _sender: { phone, token_tail: tokenTail, token_kind: tokenKind, created_by: createdBy },
    });
    if (insErr || !inserted) return json({ ok: false, error: "Gagal mengirim pesan" }, 500);

    return json({ ok: true, message: inserted });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
