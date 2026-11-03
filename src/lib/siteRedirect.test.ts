import { describe, it, expect, beforeEach } from 'vitest';
import { withLiveCredentials, buildReplayHandoff, crossTarget, stashLivePassword, isLocalSecretReplay } from './siteRedirect';

describe('site redirect handoff', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it('carries saved show token to website B', () => {
    localStorage.setItem('replaytime-show-purchased', JSON.stringify({ s1: { token: 'TOK', kind: 'show', paidAt: 1 } }));
    expect(withLiveCredentials('?show=s1')).toBe('?show=s1&t=TOK');
  });
  it('carries typed live password once', () => {
    stashLivePassword('ABC123');
    expect(withLiveCredentials('?show=s1')).toBe('?show=s1&pw=ABC123');
    expect(withLiveCredentials('?show=s1')).toBe('?show=s1');
  });
  it('carries replay password', () => {
    sessionStorage.setItem('replaytime-pw-r1', 'PW1');
    expect(buildReplayHandoff('https://b.id', 'rply', 'r1')).toBe('https://b.id/rply?replay=r1&pw=PW1');
  });
  it('no redirect when same host', () => {
    expect(crossTarget('https://realtim48show.my.id', 'www.realtim48show.my.id')).toBe('');
    expect(crossTarget('https://realtim48show.my.id', 'realtime48show.my.id')).toBe('https://realtim48show.my.id');
  });
});

import { replayLocked, parseRouting as pr } from './siteRedirect';
describe('replayLocked', () => {
  const both = pr([{ key: 'compact_replay_cards', value: 'true' }, { key: 'hide_youtube_on_main', value: 'true' }, { key: 'replay_path', value: 'rply' }]);
  it('locks main list only when both toggles on', () => {
    expect(replayLocked(both, '/')).toBe(true);
    expect(replayLocked(pr([{ key: 'compact_replay_cards', value: 'true' }]), '/')).toBe(false);
  });
  it('never locks the secret replay path', () => {
    expect(replayLocked(both, '/rply')).toBe(false);
  });
});

describe('direct secret replay access', () => {
  const routing = pr([{ key: 'replay_path', value: 'rply' }, { key: 'replay_origin', value: 'https://realtim48show.my.id' }]);
  it('keeps the direct secret list on the website being opened', () => {
    expect(isLocalSecretReplay(routing, '/rply', '')).toBe(true);
    expect(isLocalSecretReplay(routing, '/RPLY/', '?month=2026-11')).toBe(true);
    expect(isLocalSecretReplay(routing, '/', '')).toBe(false);
  });
  it('preserves website B routing for replay access links', () => {
    for (const search of ['?replay=r1', '?token=test-token', '?pw=test-password', '?mtoken=test-member']) {
      expect(isLocalSecretReplay(routing, '/rply', search)).toBe(false);
    }
    expect(isLocalSecretReplay(routing, '/akses', '?token=test-token')).toBe(false);
  });
});
