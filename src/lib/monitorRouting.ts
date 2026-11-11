/** Only routing is bypassed; live access and chat roles remain server-verified. */
export function keepMonitorLocal(search: string, embedded: boolean): boolean {
  return embedded || new URLSearchParams(search).get('admin_monitor') === '1';
}