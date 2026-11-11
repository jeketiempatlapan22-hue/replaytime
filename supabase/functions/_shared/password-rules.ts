/** Shared server-only password comparison; do not use SQL LIKE for exact secrets. */
export function samePassword(value: unknown, input: unknown): boolean {
  const saved = String(value || '').trim().toUpperCase();
  const entered = String(input || '').trim().toUpperCase();
  return saved.length > 0 && entered.length > 0 && saved === entered;
}

/** Calendar month of the content plus current month in WIB (UTC+7). */
export function passwordMonths(contentDate: string | null | undefined, now = Date.now()): string[] {
  const months = new Set<string>();
  if (contentDate && /^\d{4}-\d{2}-\d{2}$/.test(contentDate)) months.add(contentDate.slice(0, 7));
  months.add(new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 7));
  return [...months];
}