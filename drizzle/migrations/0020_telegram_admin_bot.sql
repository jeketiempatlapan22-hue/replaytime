CREATE TABLE public.telegram_admins (
  chat_id bigint PRIMARY KEY,
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.telegram_admin_link_codes (
  code text PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
GRANT SELECT, DELETE ON public.telegram_admins TO authenticated;
GRANT ALL ON public.telegram_admins TO service_role;
GRANT SELECT, INSERT ON public.telegram_admin_link_codes TO authenticated;
GRANT ALL ON public.telegram_admin_link_codes TO service_role;
ALTER TABLE public.telegram_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_admin_link_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read telegram admins" ON public.telegram_admins FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete telegram admins" ON public.telegram_admins FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins create own link codes" ON public.telegram_admin_link_codes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND user_id = auth.uid());
CREATE POLICY "Admins read own link codes" ON public.telegram_admin_link_codes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') AND user_id = auth.uid());
ALTER TABLE public.membership_payment_proofs ADD COLUMN IF NOT EXISTS telegram_notified_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS telegram_notified_at timestamptz;
ALTER TABLE public.membership_orders ADD COLUMN IF NOT EXISTS telegram_notified_at timestamptz;