-- 1. Kolom peran pengirim di live_messages (publik, untuk banner)
ALTER TABLE public.live_messages ADD COLUMN IF NOT EXISTS sender_role text NOT NULL DEFAULT 'user';
ALTER TABLE public.live_messages ADD COLUMN IF NOT EXISTS user_id uuid;

-- 2. Tabel privat berisi identitas pengirim chat (nomor HP, ekor token, pembuat token)
CREATE TABLE public.live_message_senders (
  message_id uuid PRIMARY KEY REFERENCES public.live_messages(id) ON DELETE CASCADE,
  user_id uuid,
  phone text NOT NULL DEFAULT '',
  token_tail text NOT NULL DEFAULT '',
  token_kind text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  browser_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.live_message_senders TO authenticated;
GRANT ALL ON public.live_message_senders TO service_role;
ALTER TABLE public.live_message_senders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view live_message_senders"
  ON public.live_message_senders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Reset massal ikatan perangkat (token tetap berlaku, jatah reset kembali 0)
CREATE OR REPLACE FUNCTION public.admin_bulk_reset_devices(_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_n integer;
  v_total integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _kind NOT IN ('membership','show','replay','order','reseller','live','all') THEN
    RAISE EXCEPTION 'invalid kind';
  END IF;

  IF _kind IN ('membership','all') THEN
    WITH d AS (DELETE FROM public.membership_token_devices RETURNING 1) SELECT count(*) INTO v_n FROM d;
    UPDATE public.membership_tokens SET manual_resets_used = 0 WHERE manual_resets_used <> 0;
    v_result := v_result || jsonb_build_object('membership', COALESCE(v_n,0));
    v_total := v_total + COALESCE(v_n,0);
  END IF;

  IF _kind IN ('show','all') THEN
    WITH d AS (DELETE FROM public.active_show_token_devices RETURNING 1) SELECT count(*) INTO v_n FROM d;
    UPDATE public.active_show_tokens SET manual_resets_used = 0 WHERE manual_resets_used <> 0;
    v_result := v_result || jsonb_build_object('show', COALESCE(v_n,0));
    v_total := v_total + COALESCE(v_n,0);
  END IF;

  IF _kind IN ('replay','all') THEN
    WITH d AS (DELETE FROM public.replay_token_devices RETURNING 1) SELECT count(*) INTO v_n FROM d;
    UPDATE public.replay_personal_tokens SET manual_resets_used = 0 WHERE manual_resets_used <> 0;
    v_result := v_result || jsonb_build_object('replay', COALESCE(v_n,0));
    v_total := v_total + COALESCE(v_n,0);
  END IF;

  IF _kind IN ('order','all') THEN
    WITH d AS (DELETE FROM public.order_token_devices RETURNING 1) SELECT count(*) INTO v_n FROM d;
    UPDATE public.orders SET manual_resets_used = 0 WHERE manual_resets_used <> 0;
    v_result := v_result || jsonb_build_object('order', COALESCE(v_n,0));
    v_total := v_total + COALESCE(v_n,0);
  END IF;

  IF _kind IN ('reseller','all') THEN
    WITH d AS (
      DELETE FROM public.active_show_token_devices dev
      USING public.active_show_tokens t, public.reseller_audit_log a
      WHERE dev.token_id = t.id AND a.token = t.token AND a.kind = 'show'
      RETURNING 1
    ) SELECT count(*) INTO v_n FROM d;
    WITH d AS (
      DELETE FROM public.replay_token_devices dev
      USING public.replay_personal_tokens t, public.reseller_audit_log a
      WHERE dev.token_id = t.id AND a.token = t.token AND a.kind = 'replay'
      RETURNING 1
    ) SELECT count(*) INTO v_n FROM d;
    v_n := COALESCE(v_n,0) + (SELECT count(*) FROM d);
    WITH d AS (
      DELETE FROM public.membership_token_devices dev
      USING public.membership_tokens t, public.reseller_audit_log a
      WHERE dev.token_id = t.id AND a.token = t.token AND a.kind = 'membership'
      RETURNING 1
    ) SELECT count(*) INTO v_n FROM d;
    v_n := COALESCE(v_n,0) + (SELECT count(*) FROM d);
    UPDATE public.active_show_tokens t SET manual_resets_used = 0
      FROM public.reseller_audit_log a WHERE a.token = t.token AND a.kind = 'show' AND t.manual_resets_used <> 0;
    UPDATE public.replay_personal_tokens t SET manual_resets_used = 0
      FROM public.reseller_audit_log a WHERE a.token = t.token AND a.kind = 'replay' AND t.manual_resets_used <> 0;
    UPDATE public.membership_tokens t SET manual_resets_used = 0
      FROM public.reseller_audit_log a WHERE a.token = t.token AND a.kind = 'membership' AND t.manual_resets_used <> 0;
    v_result := v_result || jsonb_build_object('reseller', COALESCE(v_n,0));
    v_total := v_total + COALESCE(v_n,0);
  END IF;

  IF _kind IN ('live','all') THEN
    WITH d AS (DELETE FROM public.live_token_devices RETURNING 1) SELECT count(*) INTO v_n FROM d;
    UPDATE public.live_tokens SET manual_resets_used = 0 WHERE manual_resets_used <> 0;
    v_result := v_result || jsonb_build_object('live', COALESCE(v_n,0));
    v_total := v_total + COALESCE(v_n,0);
  END IF;

  INSERT INTO public.admin_action_logs (actor_user_id, actor_email, action, filter, order_ids, affected_count, details)
  VALUES (
    auth.uid(),
    (SELECT email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1),
    'bulk_reset_devices',
    jsonb_build_object('kind', _kind),
    '{}',
    v_total,
    v_result
  );

  RETURN v_result;
END;
$func$;

-- 4. Info pengirim pesan chat (admin lihat semua, moderator tanpa nomor HP)
CREATE OR REPLACE FUNCTION public.admin_get_chat_sender(_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_is_admin boolean := public.has_role(auth.uid(), 'admin'::app_role);
  v_is_mod boolean := public.has_role(auth.uid(), 'moderator'::app_role);
  v_msg public.live_messages%ROWTYPE;
  v_sender public.live_message_senders%ROWTYPE;
  v_blocked boolean := false;
  v_target_is_mod boolean := false;
BEGIN
  IF NOT (v_is_admin OR v_is_mod) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_msg FROM public.live_messages WHERE id = _message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  SELECT * INTO v_sender FROM public.live_message_senders WHERE message_id = _message_id;
  SELECT EXISTS (SELECT 1 FROM public.chat_blocks WHERE browser_id = v_msg.browser_id) INTO v_blocked;
  IF v_msg.user_id IS NOT NULL THEN
    v_target_is_mod := public.has_role(v_msg.user_id, 'moderator'::app_role);
  END IF;

  RETURN jsonb_build_object(
    'name', v_msg.name,
    'sender_role', v_msg.sender_role,
    'user_id', v_msg.user_id,
    'phone', CASE WHEN v_is_admin THEN COALESCE(v_sender.phone, '') ELSE '' END,
    'token_tail', COALESCE(v_sender.token_tail, ''),
    'token_kind', COALESCE(v_sender.token_kind, ''),
    'created_by', COALESCE(v_sender.created_by, ''),
    'browser_id', v_msg.browser_id,
    'is_blocked', v_blocked,
    'is_moderator', v_target_is_mod
  );
END;
$func$;

-- 5. Angkat / cabut moderator (hanya admin, hanya user dengan akun login)
CREATE OR REPLACE FUNCTION public.admin_set_moderator(_user_id uuid, _on boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;
  IF _on THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'moderator'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'moderator'::app_role;
  END IF;
  RETURN true;
END;
$func$;

-- 6. Daftar moderator (hanya admin)
CREATE OR REPLACE FUNCTION public.admin_list_moderators()
RETURNS TABLE (user_id uuid, email text, username text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT ur.user_id, COALESCE(p.email, ''), COALESCE(p.username, '')
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'moderator'::app_role
    ORDER BY p.email;
END;
$func$;

-- 7. Aksi moderator: hapus pesan, blokir, buka blokir
CREATE OR REPLACE FUNCTION public.mod_delete_message(_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.live_messages WHERE id = _message_id;
  RETURN true;
END;
$func$;

CREATE OR REPLACE FUNCTION public.mod_block_chat(_browser_id text, _name text, _reason text DEFAULT '')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _browser_id IS NULL OR _browser_id = '' THEN
    RAISE EXCEPTION 'browser_id required';
  END IF;
  INSERT INTO public.chat_blocks (browser_id, last_name, reason)
  VALUES (_browser_id, COALESCE(_name, ''), COALESCE(_reason, ''))
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$func$;

CREATE OR REPLACE FUNCTION public.mod_unblock_chat(_browser_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.chat_blocks WHERE browser_id = _browser_id;
  RETURN true;
END;
$func$;