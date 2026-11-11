import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('drizzle/migrations/0019_fix_bulk_device_reset_where.sql', 'utf8');
describe('bulk device reset safety', () => {
  for (const [table, key] of [
    ['membership_token_devices', 'token_id'],
    ['active_show_token_devices', 'token_id'],
    ['replay_token_devices', 'token_id'],
    ['order_token_devices', 'order_id'],
    ['live_token_devices', 'token_id'],
  ]) {
    it(`resets ${table} with a safe-update column predicate`, () => {
      expect(sql).toContain(`DELETE FROM public.${table} WHERE ${key} IS NOT NULL RETURNING 1`);
    });
  }
  it('requires the authenticated admin role', () => {
    expect(sql).toContain("IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'");
    expect(sql).toContain("SECURITY DEFINER SET search_path TO 'public'");
  });
  it('clears single-use consumption so a show token can bind again', () => {
    expect(sql).toContain('SET used_at = NULL, used_by_browser_id = NULL WHERE used_at IS NOT NULL OR used_by_browser_id IS NOT NULL');
  });
  it('accumulates reseller device counts without reading an expired CTE', () => {
    expect(sql.match(/v_n := v_n \+ COALESCE\(v_part,0\)/g)).toHaveLength(3);
    expect(sql).not.toContain('(SELECT count(*) FROM d)');
  });
  it('does not delete access tokens or change their expiry', () => {
    expect(sql).not.toMatch(/DELETE FROM public\.(membership_tokens|active_show_tokens|replay_personal_tokens|live_tokens)\b/);
    expect(sql).not.toMatch(/SET\s+expires_at\s*=/i);
  });
});