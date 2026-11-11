CREATE OR REPLACE FUNCTION public.service_provision_review_token(_id uuid, _membership boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; mo public.membership_orders%ROWTYPE; p public.membership_packages%ROWTYPE; b public.show_bundles%ROWTYPE; tk text; pw text; tid uuid; ids uuid[]; sid uuid; starts timestamptz; ends timestamptz; days integer;
BEGIN
 IF _membership THEN
  SELECT * INTO mo FROM public.membership_orders WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF mo.status='rejected' THEN RETURN; END IF;
  IF mo.membership_token_id IS NOT NULL THEN RETURN; END IF;
  SELECT * INTO p FROM public.membership_packages WHERE id=mo.package_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'package_not_found'; END IF;
  starts:=CASE WHEN p.fixed_expires_at IS NOT NULL THEN coalesce(p.fixed_starts_at,now()) ELSE now() END;
  ends:=coalesce(p.fixed_expires_at, starts+make_interval(days=>p.duration_days));
  days:=CASE WHEN p.fixed_expires_at IS NOT NULL THEN greatest(1,ceil(extract(epoch FROM (ends-starts))/86400)::integer) ELSE p.duration_days END;
  INSERT INTO public.membership_tokens(token,password,label,phone,duration_days,starts_at,expires_at,includes_replays,max_devices,created_by,package_id)
  VALUES(upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),public.gen_short_password(),'pkg:'||p.name,mo.phone,days,starts,ends,p.includes_replays,p.max_devices,'purchase',p.id) RETURNING id INTO tid;
  UPDATE public.membership_orders SET membership_token_id=tid WHERE id=mo.id;
 ELSE
  SELECT * INTO o FROM public.orders WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF o.status='rejected' THEN RETURN; END IF;
  tk:=o.access_token;
  IF o.kind='bundle' THEN
   IF EXISTS(SELECT 1 FROM public.show_bundle_tokens WHERE token=tk) THEN RETURN; END IF;
   SELECT * INTO b FROM public.show_bundles ORDER BY created_at LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'bundle_not_found'; END IF;
   SELECT array_agg(i.show_id) INTO ids FROM public.show_bundle_items i JOIN public.active_shows s ON s.id=i.show_id WHERE i.bundle_id=b.id AND NOT i.excluded AND s.is_active AND s.replay_id IS NULL;
   IF coalesce(cardinality(ids),0)=0 THEN RAISE EXCEPTION 'bundle_empty'; END IF;
   SELECT password INTO pw FROM public.show_bundle_passwords WHERE bundle_id=b.id AND is_current ORDER BY created_at DESC LIMIT 1;
   tk:=substr(replace(gen_random_uuid()::text,'-',''),1,24);
   INSERT INTO public.show_bundle_tokens(bundle_id,token,password,label,user_id,phone,order_id,show_ids,max_devices) VALUES(b.id,tk,coalesce(pw,public.gen_short_password()),'purchase:'||o.id,o.user_id,o.user_phone,o.id,ids,1);
   FOREACH sid IN ARRAY ids LOOP
    INSERT INTO public.active_show_tokens(show_id,token,label,kind,max_devices) VALUES(sid,substr(replace(gen_random_uuid()::text,'-',''),1,24),'bundle:'||tk,'personal',1);
   END LOOP;
  ELSIF o.replay_id IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.replay_personal_tokens WHERE token=tk AND replay_id=o.replay_id) THEN RETURN; END IF;
   tk:=substr(replace(gen_random_uuid()::text,'-',''),1,24);
   INSERT INTO public.replay_personal_tokens(replay_id,token,label,max_devices) VALUES(o.replay_id,tk,'purchase:'||o.id,1);
  ELSIF o.show_id IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.active_show_tokens WHERE token=tk AND show_id=o.show_id) THEN RETURN; END IF;
   tk:=substr(replace(gen_random_uuid()::text,'-',''),1,24);
   INSERT INTO public.active_show_tokens(show_id,token,label,kind,max_devices) VALUES(o.show_id,tk,'purchase:'||o.id,'personal',1);
  ELSE RETURN;
  END IF;
  UPDATE public.orders SET access_token=tk WHERE id=o.id;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.service_provision_review_token(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_provision_review_token(uuid,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.proof_provision_review_token() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE phone text;
BEGIN
 IF NEW.order_id IS NOT NULL THEN
  SELECT m.phone INTO phone FROM public.membership_orders m WHERE m.id=NEW.order_id;
 ELSIF NEW.show_order_id IS NOT NULL THEN
  SELECT o.user_phone INTO phone FROM public.orders o WHERE o.id=NEW.show_order_id;
 ELSE RETURN NEW;
 END IF;
 IF public.norm_phone(phone) IS DISTINCT FROM public.norm_phone(NEW.phone) THEN RAISE EXCEPTION 'proof_phone_mismatch'; END IF;
 IF NEW.image_path<>'' OR NEW.note LIKE '✅ Lunas di %' THEN
  PERFORM public.service_provision_review_token(coalesce(NEW.order_id,NEW.show_order_id),NEW.order_id IS NOT NULL);
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER proof_review_credentials AFTER INSERT OR UPDATE OF order_id,show_order_id ON public.membership_payment_proofs FOR EACH ROW EXECUTE FUNCTION public.proof_provision_review_token();
CREATE OR REPLACE FUNCTION public.review_token_revocation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tk text;
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='membership_orders' THEN
  UPDATE public.membership_tokens SET revoked=(NEW.status='rejected') WHERE id=NEW.membership_token_id;
 ELSE
  tk:=NEW.access_token;
  UPDATE public.active_show_tokens SET revoked=(NEW.status='rejected') WHERE token=tk OR label='bundle:'||tk;
  UPDATE public.replay_personal_tokens SET revoked=(NEW.status='rejected') WHERE token=tk;
  UPDATE public.show_bundle_tokens SET revoked=(NEW.status='rejected') WHERE token=tk;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER order_review_revocation AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.review_token_revocation();
CREATE TRIGGER membership_review_revocation AFTER UPDATE OF status ON public.membership_orders FOR EACH ROW EXECUTE FUNCTION public.review_token_revocation();