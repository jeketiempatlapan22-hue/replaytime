ALTER TABLE public.membership_packages ADD COLUMN IF NOT EXISTS group_link text NOT NULL DEFAULT '';
ALTER TABLE public.membership_tokens ADD COLUMN IF NOT EXISTS group_link_override text DEFAULT NULL;
ALTER TABLE public.active_show_tokens ADD COLUMN IF NOT EXISTS group_link_override text DEFAULT NULL;
COMMENT ON COLUMN public.membership_tokens.group_link_override IS 'NULL inherits package group; empty string explicitly removes group for this token.';
COMMENT ON COLUMN public.active_show_tokens.group_link_override IS 'NULL inherits show group; empty string explicitly removes group for this token.';