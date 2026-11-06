-- Yearly passwords (admin only)
CREATE TABLE public.yearly_passwords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT '',
  password text NOT NULL UNIQUE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 year'),
  paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yearly_passwords TO authenticated;
GRANT ALL ON public.yearly_passwords TO service_role;
ALTER TABLE public.yearly_passwords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage yearly passwords" ON public.yearly_passwords FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Bundle token expiry
ALTER TABLE public.show_bundle_tokens ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.show_start_at(_show_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ((show_date + show_time)::timestamp AT TIME ZONE 'Asia/Jakarta') FROM active_shows WHERE id = _show_id
$$;

CREATE OR REPLACE FUNCTION public.bundle_expiry_for_shows(_ids uuid[])
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT max((show_date + show_time)::timestamp AT TIME ZONE 'Asia/Jakarta') + interval '24 hours'
  FROM active_shows WHERE id = ANY(_ids)
$$;

-- Personal show tokens: 24h after show start; bundle sub-tokens: 24h after last show in bundle
CREATE OR REPLACE FUNCTION public.set_show_token_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[];
BEGIN
  IF NEW.kind <> 'personal' THEN RETURN NEW; END IF;
  IF NEW.label LIKE 'bundle:%' THEN
    SELECT array_agg(i.show_id) INTO ids FROM show_bundle_items i
      JOIN active_shows s ON s.id = i.show_id
      WHERE i.excluded = false AND s.is_active
        AND i.bundle_id = (SELECT id FROM show_bundles ORDER BY created_at LIMIT 1);
    ids := array_append(coalesce(ids, '{}'), NEW.show_id);
    NEW.expires_at := public.bundle_expiry_for_shows(ids);
  ELSE
    NEW.expires_at := public.show_start_at(NEW.show_id) + interval '24 hours';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_set_show_token_expiry ON public.active_show_tokens;
CREATE TRIGGER trg_set_show_token_expiry BEFORE INSERT ON public.active_show_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_show_token_expiry();

CREATE OR REPLACE FUNCTION public.set_bundle_token_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.expires_at := public.bundle_expiry_for_shows(NEW.show_ids);
  UPDATE active_show_tokens SET expires_at = NEW.expires_at WHERE label = 'bundle:' || NEW.token;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_set_bundle_token_expiry ON public.show_bundle_tokens;
CREATE TRIGGER trg_set_bundle_token_expiry BEFORE INSERT OR UPDATE OF show_ids ON public.show_bundle_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_bundle_token_expiry();

-- Reschedule => tokens follow
CREATE OR REPLACE FUNCTION public.sync_token_expiry_on_show_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  UPDATE active_show_tokens SET expires_at = public.show_start_at(NEW.id) + interval '24 hours'
    WHERE show_id = NEW.id AND kind = 'personal' AND label NOT LIKE 'bundle:%';
  FOR b IN SELECT token, show_ids FROM show_bundle_tokens WHERE NEW.id = ANY(show_ids) LOOP
    UPDATE show_bundle_tokens SET expires_at = public.bundle_expiry_for_shows(b.show_ids) WHERE token = b.token;
    UPDATE active_show_tokens SET expires_at = public.bundle_expiry_for_shows(b.show_ids) WHERE label = 'bundle:' || b.token;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_token_expiry_on_show_change ON public.active_shows;
CREATE TRIGGER trg_sync_token_expiry_on_show_change AFTER UPDATE OF show_date, show_time ON public.active_shows
  FOR EACH ROW WHEN (OLD.show_date IS DISTINCT FROM NEW.show_date OR OLD.show_time IS DISTINCT FROM NEW.show_time)
  EXECUTE FUNCTION public.sync_token_expiry_on_show_change();

-- Backfill existing tokens
UPDATE public.show_bundle_tokens SET expires_at = public.bundle_expiry_for_shows(show_ids);
UPDATE public.active_show_tokens t SET expires_at = b.expires_at
  FROM public.show_bundle_tokens b WHERE t.label = 'bundle:' || b.token;
UPDATE public.active_show_tokens SET expires_at = public.show_start_at(show_id) + interval '24 hours'
  WHERE kind = 'personal' AND label NOT LIKE 'bundle:%';

-- Hourly purge: expired links deleted immediately; only custom (user/rotated) passwords purged after 3 months
CREATE OR REPLACE FUNCTION public.purge_expired_membership_tokens()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; k integer;
BEGIN
  DELETE FROM membership_token_devices WHERE token_id IN (SELECT id FROM membership_tokens WHERE expires_at < now());
  DELETE FROM membership_token_passwords WHERE token_id IN (SELECT id FROM membership_tokens WHERE expires_at < now());
  DELETE FROM membership_tokens WHERE expires_at < now();
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  DELETE FROM active_show_token_devices WHERE token_id IN (SELECT id FROM active_show_tokens WHERE expires_at < now());
  DELETE FROM active_show_tokens WHERE expires_at < now();
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  DELETE FROM show_bundle_tokens WHERE expires_at < now();
  DELETE FROM replay_token_devices WHERE token_id IN (SELECT id FROM replay_personal_tokens WHERE expires_at < now());
  DELETE FROM replay_personal_tokens WHERE expires_at < now();
  -- custom passwords only (not admin-made): 3 months after creation
  DELETE FROM membership_token_passwords WHERE created_at < now() - interval '3 months';
  DELETE FROM membership_replay_passwords WHERE created_at < now() - interval '3 months';
  DELETE FROM yearly_passwords WHERE expires_at < now() - interval '7 days';
  RETURN n;
END $$;