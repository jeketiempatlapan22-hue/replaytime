// Single canonical origin for all shareable links (token, replay, live, dll).
// Sinkron dengan PRIMARY_HOST di src/main.tsx.
export const SITE_ORIGIN = 'https://realtime48show.my.id';

export function siteOrigin(): string {
  return SITE_ORIGIN;
}

export function siteLink(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_ORIGIN}${p}`;
}
