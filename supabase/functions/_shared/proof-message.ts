import { appendGroupLink, membershipGroupLink, resolveGroupLink } from './group-link.ts';

export function accessMessage(parts: { phone: string; title: string; link: string; replayOrigin: string; password: string; info?: string; expires?: string }): string {
  return [`WhatsApp Pembeli: ${parts.phone}`, `🎤 *${parts.title}*`, `🔗 *Link Akses:*\n${parts.link}`,
    `🎬 *Link Replay:*\n${parts.replayOrigin}`, `🔐 Sandi: *${parts.password || '-'}*`,
    parts.info || '', parts.expires ? `Berlaku sampai: ${parts.expires}` : ''].filter(Boolean).join('\n\n');
}

export async function buildCopyMessage(admin: any, proof: any): Promise<string | null> {
  const id = proof.order_id || proof.show_order_id;
  if (!id) return null;
  const { error: provisionError } = await admin.rpc('service_provision_review_token', { _id: id, _membership: !!proof.order_id });
  if (provisionError) throw provisionError;
  const { data: settings, error: settingsError } = await admin.from('site_settings').select('key,value').in('key', ['link_origin', 'main_origin', 'site_origin']);
  if (settingsError) throw settingsError;
  const values = Object.fromEntries((settings || []).map((r: any) => [r.key, r.value]));
  const raw = values.link_origin || values.main_origin || values.site_origin || 'https://realtime48show.my.id';
  const url = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('invalid_origin');
  url.hostname = url.hostname.replace(/^www\./, '');
  const origin = url.origin;
  if (proof.order_id) {
    const { data: order } = await admin.from('membership_orders').select('*').eq('id', id).single();
    if (!order?.membership_token_id) return null;
    const { data: token } = await admin.from('membership_tokens').select('*').eq('id', order.membership_token_id).single();
    if (!token) return null;
    const { data: pkg } = await admin.from('membership_packages').select('name,replay_info').eq('id', order.package_id).single();
    return appendGroupLink(accessMessage({ phone: order.phone || proof.phone, title: pkg?.name || proof.package_name,
      link: `${origin}/live?mtoken=${encodeURIComponent(token.token)}&mp=${encodeURIComponent(token.password)}`,
      replayOrigin: origin, password: token.password, info: pkg?.replay_info, expires: token.expires_at }), await membershipGroupLink(admin, token));
  }
  const { data: order } = await admin.from('orders').select('*').eq('id', id).single();
  if (!order?.access_token) return null;
  let password = '', info = '', group = '', link = '';
  if (order.kind === 'bundle') {
    const { data: token } = await admin.from('show_bundle_tokens').select('password').eq('token', order.access_token).single();
    password = token?.password || '';
    link = `${origin}/shows?bt=${encodeURIComponent(order.access_token)}`;
  } else if (order.replay_id) {
    const { data: replay } = await admin.from('replays').select('password').eq('id', order.replay_id).single();
    password = replay?.password || '';
    link = `${origin}/?replay=${order.replay_id}&token=${encodeURIComponent(order.access_token)}`;
  } else if (order.show_id) {
    const { data: show } = await admin.from('active_shows').select('live_password,replay_id,replay_info,group_link,group_link_enabled').eq('id', order.show_id).single();
    password = show?.live_password || '';
    if (!password && show?.replay_id) {
      const { data: replay } = await admin.from('replays').select('password').eq('id', show.replay_id).single();
      password = replay?.password || '';
    }
    const { data: token } = await admin.from('active_show_tokens').select('group_link_override').eq('token', order.access_token).single();
    group = resolveGroupLink(show?.group_link_enabled ? show.group_link : '', token?.group_link_override);
    info = show?.replay_info || '';
    link = `${origin}/live?show=${order.show_id}&t=${encodeURIComponent(order.access_token)}`;
  }
  if (!link) return null;
  return appendGroupLink(accessMessage({ phone: order.user_phone || proof.phone, title: order.item_title,
    link, replayOrigin: origin, password, info }), group);
}