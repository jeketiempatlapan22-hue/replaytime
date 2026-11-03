// Mode Perbaikan per website: setiap domain punya saklar sendiri
// (site_settings key `maintenance_mode:<host tanpa www>`), jadi Website A dan B
// tidak saling menutup. Saklar lama `maintenance_mode` + `maintenance_origin`
// tetap dibaca untuk kompatibilitas.
export const bareMaintHost = (host: string) => String(host || '').toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');

export const maintenanceKey = (host: string) => `maintenance_mode:${bareMaintHost(host)}`;

export function isMaintenanceHere(settings: Record<string, string | undefined>, host: string): boolean {
  if (settings[maintenanceKey(host)] === 'true') return true;
  if (settings.maintenance_mode !== 'true') return false;
  const origin = String(settings.maintenance_origin || '').trim();
  if (!origin) return false; // saklar lama tanpa asal tidak lagi menutup semua website
  try { return bareMaintHost(new URL(origin).host) === bareMaintHost(host); } catch { return false; }
}
