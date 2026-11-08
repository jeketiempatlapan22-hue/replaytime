CREATE TABLE public.doku_transactions (
 order_id text PRIMARY KEY,
 reference_no text UNIQUE,
 amount bigint NOT NULL,
 qr_content text,
 expires_at timestamptz,
 environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
 status text NOT NULL DEFAULT 'creating',
 checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.doku_transactions TO service_role;
REVOKE ALL ON public.doku_transactions FROM anon, authenticated;
ALTER TABLE public.doku_transactions ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.doku_transactions IS 'Server-only DOKU SNAP references and QR cache. Old pakasir_order_id columns are retained as legacy storage of merchant invoice IDs; no Pakasir calls are made.';