export function safeGroupLink(value: unknown): string {
  const text = String(value ?? '').trim();
  try {
    const url = new URL(text);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

// NULL inherits the administrator's group; an empty override deliberately removes it.
export function resolveGroupLink(base: unknown, override: unknown = null): string {
  return safeGroupLink(override == null ? base : override);
}

export function appendGroupLink(message: string, group: unknown): string {
  const link = safeGroupLink(group);
  const block = link ? `👥 *Gabung Grup:*\n${link}` : '';
  const hasPlaceholder = /\{group_link(?:_block)?\}/.test(message);
  const rendered = message.replace(/\{group_link_block\}/g, block).replace(/\{group_link\}/g, link);
  return !link || hasPlaceholder || rendered.includes(link) ? rendered : `${rendered}\n\n${block}`;
}

export async function membershipGroupLink(admin: any, token: any): Promise<string> {
  if (token.group_link_override != null) return resolveGroupLink('', token.group_link_override);
  if (!token.package_id) return '';
  const { data } = await admin.from('membership_packages').select('group_link').eq('id', token.package_id).maybeSingle();
  return resolveGroupLink(data?.group_link);
}

// Resolve only a token already embedded in an access message, never by recipient phone.
export async function enrichAccessMessage(admin: any, message: string): Promise<string> {
  for (const raw of message.match(/https?:\/\/[^\s<>]+/g) || []) {
    let url: URL;
    try { url = new URL(raw); } catch { continue; }
    const mtoken = url.searchParams.get('mtoken');
    if (mtoken) {
      const { data } = await admin.from('membership_tokens').select('package_id,group_link_override').eq('token', mtoken).maybeSingle();
      if (data) return appendGroupLink(message, await membershipGroupLink(admin, data));
    }
    const token = url.searchParams.get('t') || url.searchParams.get('token');
    if (token) {
      const { data } = await admin.from('active_show_tokens').select('show_id,group_link_override').eq('token', token).maybeSingle();
      if (data) {
        const { data: show } = await admin.from('active_shows').select('group_link,group_link_enabled').eq('id', data.show_id).maybeSingle();
        return appendGroupLink(message, resolveGroupLink(show?.group_link_enabled ? show.group_link : '', data.group_link_override));
      }
    }
  }
  return appendGroupLink(message, '');
}