CREATE OR REPLACE FUNCTION public.token_cleanup_at(_expires_at timestamptz) RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT _expires_at + interval '7 days' $$;
CREATE OR REPLACE FUNCTION public.purge_expired_membership_tokens() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; k integer;
BEGIN
 DELETE FROM membership_token_devices WHERE token_id IN (SELECT id FROM membership_tokens WHERE public.token_cleanup_at(expires_at)<now());
 DELETE FROM membership_token_passwords WHERE token_id IN (SELECT id FROM membership_tokens WHERE public.token_cleanup_at(expires_at)<now());
 UPDATE membership_orders SET membership_token_id=NULL WHERE membership_token_id IN (SELECT id FROM membership_tokens WHERE public.token_cleanup_at(expires_at)<now());
 DELETE FROM membership_tokens WHERE public.token_cleanup_at(expires_at)<now(); GET DIAGNOSTICS k=ROW_COUNT; n:=n+k;
 DELETE FROM active_show_token_devices WHERE token_id IN (SELECT id FROM active_show_tokens WHERE public.token_cleanup_at(expires_at)<now());
 DELETE FROM active_show_tokens WHERE public.token_cleanup_at(expires_at)<now(); GET DIAGNOSTICS k=ROW_COUNT; n:=n+k;
 DELETE FROM show_bundle_tokens WHERE public.token_cleanup_at(expires_at)<now(); GET DIAGNOSTICS k=ROW_COUNT; n:=n+k;
 DELETE FROM replay_token_devices WHERE token_id IN (SELECT id FROM replay_personal_tokens WHERE public.token_cleanup_at(expires_at)<now());
 DELETE FROM replay_personal_tokens WHERE public.token_cleanup_at(expires_at)<now(); GET DIAGNOSTICS k=ROW_COUNT; n:=n+k;
 DELETE FROM membership_token_passwords WHERE created_at<now()-interval '3 months';
 DELETE FROM membership_replay_passwords WHERE created_at<now()-interval '3 months';
 DELETE FROM yearly_passwords WHERE expires_at<now()-interval '7 days';
 RETURN n;
END $$;
CREATE OR REPLACE FUNCTION public.service_send_live_chat(_message jsonb, _sender jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.live_messages;
BEGIN
 INSERT INTO public.live_messages(browser_id,name,message,is_admin,pinned,reply_to_id,show_id,sender_role,user_id)
 VALUES (_message->>'browser_id',_message->>'name',_message->>'message',coalesce((_message->>'is_admin')::boolean,false),false,(_message->>'reply_to_id')::uuid,(_message->>'show_id')::uuid,_message->>'sender_role',(_message->>'user_id')::uuid) RETURNING * INTO m;
 INSERT INTO public.live_message_senders(message_id,user_id,phone,token_tail,token_kind,created_by,browser_id)
 VALUES(m.id,m.user_id,coalesce(_sender->>'phone',''),coalesce(_sender->>'token_tail',''),coalesce(_sender->>'token_kind','guest'),coalesce(_sender->>'created_by',''),m.browser_id);
 RETURN to_jsonb(m);
END $$;
REVOKE ALL ON FUNCTION public.service_send_live_chat(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_send_live_chat(jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.admin_get_chat_sender(_message_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a boolean:=public.has_role(auth.uid(),'admin'); md boolean:=public.has_role(auth.uid(),'moderator'); m public.live_messages; s public.live_message_senders; p public.profiles;
BEGIN
 IF NOT(a OR md) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO m FROM live_messages WHERE id=_message_id; IF NOT FOUND THEN RAISE EXCEPTION 'message not found'; END IF;
 SELECT * INTO s FROM live_message_senders WHERE message_id=m.id;
 SELECT * INTO p FROM profiles WHERE user_id=coalesce(m.user_id,s.user_id);
 RETURN jsonb_build_object('name',m.name,'sender_role',m.sender_role,'user_id',coalesce(m.user_id,s.user_id),'phone',CASE WHEN a THEN coalesce(nullif(s.phone,''),p.phone,'') ELSE '' END,'email',CASE WHEN a THEN coalesce(p.email,'') ELSE '' END,'username',coalesce(p.username,''),'token_tail',coalesce(s.token_tail,''),'token_kind',coalesce(s.token_kind,'guest'),'created_by',coalesce(s.created_by,''),'browser_id',m.browser_id,'identity_recorded',s.message_id IS NOT NULL,'is_blocked',EXISTS(SELECT 1 FROM chat_blocks WHERE browser_id=m.browser_id),'is_moderator',public.has_role(coalesce(m.user_id,s.user_id),'moderator'));
END $$;
CREATE OR REPLACE FUNCTION public.admin_token_factory_owners(_ids uuid[]) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'phone',coalesce(o.user_phone,''),'email',coalesce(p.email,''),'username',coalesce(p.username,''),'created_by',CASE WHEN t.label LIKE 'reseller:%' THEN t.label ELSE 'admin' END)) FROM active_show_tokens t LEFT JOIN LATERAL(SELECT user_phone,user_id FROM orders WHERE access_token=t.token AND status='paid' ORDER BY created_at DESC LIMIT 1)o ON true LEFT JOIN profiles p ON p.user_id=o.user_id WHERE t.id=ANY(_ids)),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_token_factory_owners(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_token_factory_owners(uuid[]) TO authenticated,service_role;