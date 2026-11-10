import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('drizzle/migrations/0013_retain_tokens_and_atomic_chat_identity.sql', 'utf8');
describe('token retention', () => {
  it('retains tokens exactly seven days after expiry', () => {
    const match = sql.match(/SELECT _expires_at \+ interval '(\d+) days'/);
    expect(Number(match?.[1])).toBe(7);
  });
  for (const table of ['membership_tokens', 'active_show_tokens', 'show_bundle_tokens', 'replay_personal_tokens']) {
    it(`cleans ${table} only after the retention deadline`, () => {
      expect(sql).toContain(`DELETE FROM ${table} WHERE public.token_cleanup_at(expires_at)<now()`);
    });
  }
  it('never modifies access expiry during retention cleanup', () => {
    expect(sql).not.toMatch(/UPDATE\s+(membership_tokens|active_show_tokens|show_bundle_tokens|replay_personal_tokens)\s+SET\s+expires_at/i);
  });
});