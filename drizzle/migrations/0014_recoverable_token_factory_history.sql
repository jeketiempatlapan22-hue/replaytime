CREATE TABLE public.token_factory_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token text NOT NULL UNIQUE, kind text NOT NULL, label text NOT NULL DEFAULT '', title text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', created_at timestamptz NOT NULL, expires_at timestamptz, original_link text NOT NULL DEFAULT '', restored_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.token_factory_history TO authenticated;
GRANT ALL ON public.token_factory_history TO service_role;
ALTER TABLE public.token_factory_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read recovered token history" ON public.token_factory_history FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
COMMENT ON TABLE public.token_factory_history IS 'Recovered token history only; never consulted by access verification. Phone is copied only from a verified paid order, never from reseller creator details.';
CREATE OR REPLACE FUNCTION public.purge_token_factory_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN DELETE FROM public.token_factory_history WHERE public.token_cleanup_at(coalesce(expires_at,created_at))<now(); RETURN NULL; END $$;
CREATE TRIGGER purge_token_factory_history_after_cleanup AFTER DELETE ON public.active_show_tokens FOR EACH STATEMENT EXECUTE FUNCTION public.purge_token_factory_history();