ALTER TABLE public.replays ADD COLUMN IF NOT EXISTS short_title text NOT NULL DEFAULT '';
GRANT SELECT (short_title) ON public.replays TO anon, authenticated;
INSERT INTO public.site_settings (key, value) VALUES ('hide_youtube_on_main','false'), ('compact_replay_cards','false') ON CONFLICT (key) DO NOTHING;