CREATE OR REPLACE FUNCTION public.admin_bulk_reset_devices(_kind text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb := '{}'::jsonb; v_n integer; v_part integer; v_total integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _kind NOT IN ('membership','show','replay','order','reseller','live','all') THEN RAISE EXCEPTION 'invalid kind'; END IF;

  IF _kind IN ('membership','all') THEN
    WITH d AS (DELETE FROM public.membership_token_devices WHERE token_id IS NOT NULL RETURNING 1) SELECT count(*) INTO v_n FROM d;
    UPDATE public.membership_tokens SET manual_resets_used = 0 WHERE manual_resets_used <> 0;
    v_result := v_result || jsonb_build_object('membership', COALESCE(v_n,0)); v_total := v_total + COALESCE(v_n,0);
  END IF;

  IF _kind IN ('show','all') THEN
    WITH d AS (DELETE FROM public.active_show_token_devices WHERE token_id IS NOT NULL RETURNING 1) SELECT count(*) INTO v_n FROM d;
    UPDATE public.active_show_tokens SET manual_resets_used = 0 WHERE manual_resets_used <> 0;
    UPDATE public.active_show_tokens SET used_at = NULL, used_by_browser_id = NULL WHERE used_at IS NOT NULL OR used_by_browser_id IS NOT NULL;
    v_result := v_result || jsonb_build_object('show', COALESCE(v_n,0)); v_total := v_total + COALESCE(v_n,0);
  END IF;

  IF _kind IN ('replay','all') THEN
    WITH d AS (DELETE FROM public.replay_token_devices WHERE token_id IS NOT NULL RETURNING 1) SELECT count(*) INTO v_n FROM d;
    UPDATE public.replay_personal_tokens SET manual_resets_used = 0 WHERE manual_resets_used <> 0;
    v_result := v_result || jsonb_build_object('replay', COALESCE(v_n,0)); v_total := v_total + COALESCE(v_n,0);
  END IF;

  IF _kind IN ('order','all') THEN
    WITH d AS (DELETE FROM public.order_token_devices WHERE order_id IS NOT NULL RETURNING 1) SELECT count(*) INTO v_n FROM d;
    UPDATE public.orders SET manual_resets_used = 0 WHERE manual_resets_used <> 0;
    v_result := v_result || jsonb_build_object('order', COALESCE(v_n,0)); v_total := v_total + COALESCE(v_n,0);
  END IF;

  IF _kind IN ('reseller','all') THEN
    v_n := 0;
    WITH d AS (DELETE FROM public.active_show_token_devices dev USING public.active_show_tokens t, public.reseller_audit_log a
      WHERE dev.token_id = t.id AND a.token = t.token AND a.kind = 'show' RETURNING 1) SELECT count(*) INTO v_part FROM d;
    v_n := v_n + COALESCE(v_part,0);
    WITH d AS (DELETE FROM public.replay_token_devices dev USING public.replay_personal_tokens t, public.reseller_audit_log a
      WHERE dev.token_id = t.id AND a.token = t.token AND a.kind = 'replay' RETURNING 1) SELECT count(*) INTO v_part FROM d;
    v_n := v_n + COALESCE(v_part,0);
    WITH d AS (DELETE FROM public.membership_token_devices dev USING public.membership_tokens t, public.reseller_audit_log a
      WHERE dev.token_id = t.id AND a.token = t.token AND a.kind = 'membership' RETURNING 1) SELECT count(*) INTO v_part FROM d;
    v_n := v_n + COALESCE(v_part,0);
    UPDATE public.active_show_tokens t SET manual_resets_used = 0 FROM public.reseller_audit_log a WHERE a.token = t.token AND a.kind = 'show' AND t.manual_resets_used <> 0;
    UPDATE public.active_show_tokens t SET used_at = NULL, used_by_browser_id = NULL FROM public.reseller_audit_log a WHERE a.token = t.token AND a.kind = 'show' AND (t.used_at IS NOT NULL OR t.used_by_browser_id IS NOT NULL);
    UPDATE public.replay_personal_tokens t SET manual_resets_used = 0 FROM public.reseller_audit_log a WHERE a.token = t.token AND a.kind = 'replay' AND t.manual_resets_used <> 0;
    UPDATE public.membership_tokens t SET manual_resets_used = 0 FROM public.reseller_audit_log a WHERE a.token = t.token AND a.kind = 'membership' AND t.manual_resets_used <> 0;
    v_result := v_result || jsonb_build_object('reseller', v_n); v_total := v_total + v_n;
  END IF;

  IF _kind IN ('live','all') THEN
    WITH d AS (DELETE FROM public.live_token_devices WHERE token_id IS NOT NULL RETURNING 1) SELECT count(*) INTO v_n FROM d;
    UPDATE public.live_tokens SET manual_resets_used = 0 WHERE manual_resets_used <> 0;
    v_result := v_result || jsonb_build_object('live', COALESCE(v_n,0)); v_total := v_total + COALESCE(v_n,0);
  END IF;

  INSERT INTO public.admin_action_logs (actor_user_id, actor_email, action, filter, order_ids, affected_count, details)
  VALUES (auth.uid(), (SELECT email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1), 'bulk_reset_devices', jsonb_build_object('kind', _kind), '{}', v_total, v_result);
  RETURN v_result;
END;
$function$;