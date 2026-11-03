CREATE OR REPLACE FUNCTION public.get_my_memberships()
 RETURNS TABLE(order_id uuid, package_id uuid, package_name text, status text, kind text, amount integer, coin_amount integer, created_at timestamp with time zone, reserved_until timestamp with time zone, paid_at timestamp with time zone, email text, phone text, token text, password text, expires_at timestamp with time zone, starts_at timestamp with time zone, duration_days integer, max_devices integer, includes_replays boolean, days_remaining integer, revoked boolean, package_paused boolean, pause_message text, pakasir_qr_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT auth.uid() AS uid,
           NULLIF(public.norm_phone(COALESCE((SELECT pr.phone FROM public.profiles pr WHERE pr.user_id = auth.uid() LIMIT 1), '')), '') AS ph
  ),
  from_orders AS (
    SELECT
      o.id AS order_id, o.package_id, p.name AS package_name, o.status, o.kind, o.amount, o.coin_amount,
      o.created_at, o.reserved_until, o.paid_at, o.email, o.phone,
      t.token, t.password, t.expires_at, t.starts_at,
      COALESCE(t.duration_days, p.duration_days) AS duration_days,
      COALESCE(t.max_devices, p.max_devices) AS max_devices,
      COALESCE(t.includes_replays, p.includes_replays) AS includes_replays,
      CASE WHEN t.expires_at IS NULL THEN NULL
           ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (t.expires_at - now())) / 86400.0))::int END AS days_remaining,
      COALESCE(t.revoked, false) AS revoked,
      COALESCE(p.paused, false) AS package_paused,
      COALESCE(p.pause_message, '') AS pause_message,
      COALESCE(o.pakasir_qr_url, '') AS pakasir_qr_url,
      o.membership_token_id AS tid
    FROM public.membership_orders o
    LEFT JOIN public.membership_packages p ON p.id = o.package_id
    LEFT JOIN public.membership_tokens t ON t.id = o.membership_token_id
    WHERE o.user_id = (SELECT uid FROM me)
  ),
  -- Membership dibuat admin/reseller untuk nomor HP akun ini (tanpa order website).
  from_phone AS (
    SELECT
      t.id AS order_id, t.package_id, COALESCE(NULLIF(p.name, ''), NULLIF(t.label, ''), 'Membership') AS package_name,
      'paid'::text AS status, 'manual'::text AS kind, 0 AS amount, 0 AS coin_amount,
      t.created_at, NULL::timestamptz AS reserved_until, t.starts_at AS paid_at, ''::text AS email, t.phone,
      t.token, t.password, t.expires_at, t.starts_at,
      t.duration_days, t.max_devices, t.includes_replays,
      CASE WHEN t.expires_at IS NULL THEN NULL
           ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (t.expires_at - now())) / 86400.0))::int END AS days_remaining,
      t.revoked,
      COALESCE(p.paused, false) AS package_paused,
      COALESCE(p.pause_message, '') AS pause_message,
      ''::text AS pakasir_qr_url,
      t.id AS tid
    FROM public.membership_tokens t
    LEFT JOIN public.membership_packages p ON p.id = t.package_id
    WHERE (SELECT ph FROM me) IS NOT NULL
      AND public.norm_phone(t.phone) = (SELECT ph FROM me)
      AND t.expires_at > now() - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM from_orders fo WHERE fo.tid = t.id)
  )
  SELECT order_id, package_id, package_name, status, kind, amount, coin_amount, created_at, reserved_until, paid_at,
         email, phone, token, password, expires_at, starts_at, duration_days, max_devices, includes_replays,
         days_remaining, revoked, package_paused, pause_message, pakasir_qr_url
  FROM (SELECT * FROM from_orders UNION ALL SELECT * FROM from_phone) x
  ORDER BY (status = 'paid' AND NOT revoked AND (expires_at IS NULL OR expires_at > now())) DESC, created_at DESC;
$function$;
GRANT EXECUTE ON FUNCTION public.get_my_memberships() TO authenticated;