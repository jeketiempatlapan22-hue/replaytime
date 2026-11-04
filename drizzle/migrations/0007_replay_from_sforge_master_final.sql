CREATE OR REPLACE FUNCTION public.convert_show_to_replay(_show_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_show public.active_shows%ROWTYPE;
  v_replay_id uuid;
  v_source_type text;
  v_youtube_id text := '';
  v_m3u8_url text := '';
  v_sources jsonb := '[]'::jsonb;
  v_password text;
  v_show_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_show FROM public.active_shows WHERE id = _show_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'show_not_found'; END IF;

  IF COALESCE(v_show.replay_youtube_url, '') <> '' THEN
    v_source_type := 'youtube'; v_youtube_id := v_show.replay_youtube_url;
  ELSIF COALESCE(v_show.replay_m3u8_url, '') <> '' THEN
    v_source_type := 'm3u8'; v_m3u8_url := v_show.replay_m3u8_url;
  ELSIF COALESCE(v_show.server3_url, '') ~* '^https?://' THEN
    -- SForge master-final: rekaman penuh, otomatis jadi sumber replay
    v_source_type := 'm3u8'; v_m3u8_url := v_show.server3_url;
  ELSIF v_show.live_type = 'youtube' AND COALESCE(v_show.live_url, '') <> '' THEN
    v_source_type := 'youtube'; v_youtube_id := v_show.live_url;
  ELSE
    v_source_type := COALESCE(NULLIF(v_show.live_type, ''), 'youtube');
    v_m3u8_url := COALESCE(v_show.live_url, '');
  END IF;

  v_sources := COALESCE(v_show.live_sources, '[]'::jsonb);

  v_password := NULLIF(v_show.live_password, '');
  IF v_password IS NULL THEN
    SELECT mp.password INTO v_password FROM public.master_passwords mp
    WHERE mp.month = to_char(v_show.show_date, 'YYYY-MM') AND COALESCE(mp.paused, false) = false LIMIT 1;
  END IF;
  v_password := COALESCE(v_password, '');
  v_show_name := COALESCE(NULLIF(v_show.category, ''), v_show.title);

  INSERT INTO public.replays(
    title, show_name, date, show_time, criteria, featured_member, lineup,
    password, youtube_id, m3u8_url, source_type, sources, image_url,
    admin_alias, price_coins, short_title
  ) VALUES (
    v_show.title, v_show_name, v_show.show_date, v_show.show_time, '', '',
    v_show.lineup, v_password, v_youtube_id, v_m3u8_url, v_source_type, v_sources,
    v_show.image_url, COALESCE(v_show.admin_alias, ''), COALESCE(v_show.price_replay_coins, 0),
    COALESCE(v_show.short_title, '')
  ) RETURNING id INTO v_replay_id;

  UPDATE public.active_shows
    SET is_active = false, is_live = false, replay_enabled = true,
        replay_id = v_replay_id, updated_at = now()
    WHERE id = _show_id;
  DELETE FROM public.live_messages WHERE show_id = _show_id;
  RETURN v_replay_id;
END;
$function$;