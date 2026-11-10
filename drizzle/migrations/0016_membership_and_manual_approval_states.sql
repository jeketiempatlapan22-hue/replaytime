ALTER TABLE public.membership_orders DROP CONSTRAINT membership_orders_status_chk;
ALTER TABLE public.membership_orders ADD CONSTRAINT membership_orders_status_chk CHECK (status IN ('reserved','paid','expired','cancelled','awaiting_approval','rejected'));
ALTER TABLE public.membership_payment_proofs ADD COLUMN review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected'));
COMMENT ON COLUMN public.membership_payment_proofs.review_status IS 'Admin review state including manual proofs not yet linked to an order';