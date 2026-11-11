CREATE OR REPLACE FUNCTION public.proof_provision_review_token() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE phone text;
BEGIN
 IF NEW.order_id IS NOT NULL THEN SELECT m.phone INTO phone FROM public.membership_orders m WHERE m.id=NEW.order_id;
 ELSIF NEW.show_order_id IS NOT NULL THEN SELECT o.user_phone INTO phone FROM public.orders o WHERE o.id=NEW.show_order_id;
 ELSE RETURN NEW; END IF;
 IF public.norm_phone(phone) IS DISTINCT FROM public.norm_phone(NEW.phone) THEN RAISE EXCEPTION 'proof_phone_mismatch'; END IF;
 IF NEW.image_path<>'' OR NEW.note LIKE '✅ Lunas di %' THEN
  IF NEW.image_path<>'' THEN
   IF NEW.order_id IS NOT NULL THEN UPDATE public.membership_orders SET status='awaiting_approval' WHERE id=NEW.order_id AND status IN ('reserved','expired','cancelled');
   ELSE UPDATE public.orders SET status='awaiting_approval' WHERE id=NEW.show_order_id AND status IN ('pending','expired','cancelled'); END IF;
  END IF;
  PERFORM public.service_provision_review_token(coalesce(NEW.order_id,NEW.show_order_id),NEW.order_id IS NOT NULL);
 END IF;
 RETURN NEW;
END; $$;