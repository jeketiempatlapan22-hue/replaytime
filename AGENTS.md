# Project Architecture Rules

- Store the special-show member in active_shows.featured_member and retrieve it through the existing public column allowlist, so card metadata never requires exposing stream credentials.
- Use the shared clipboard helper for access-link tools and keep complete text selectable when copying is unavailable, so browser permission failures cannot silently lose tokens.

- Group related admin tools through internal section selectors while retaining their existing components, so menu consolidation does not duplicate business logic.
- Use native controls for YouTube in the shared embed player and keep site-specific TV pairing outside the video, so replay, live, and TV share unobstructed interactions.
- Send "Link Replay" on the primary domain root (stripReplayPath in _shared/replay-origin.ts removes any secret replay_path), so messages never reveal the secret replay page while old /<path> links still open.
- Route pages across sites via DomainRouter using site_settings main_origin/live_origin/replay_origin (admin & reseller never redirected), and swap message domains via link_origin in _shared/replay-origin.ts, so twin sites sharing one backend can trade roles without reissuing links.
- Keep direct secret replay-list visits local while credential-bearing replay links still follow replay_origin, so the secret list stays reachable independently of Website B.
- Carry viewer credentials (t / mtoken+mp / pw / replay token) in the URL through src/lib/siteRedirect.ts whenever DomainRouter or a watch button crosses to another domain, because purchases are stored per-origin in browser storage.
- Gate YouTube sources server-side in get-replay-source via site_settings.hide_youtube_on_main (only replay_origin receives them) and gate compact cards via compact_replay_cards, so both modes are reversible without touching replay data.
- In lock mode (compact_replay_cards + hide_youtube_on_main, via replayLocked()), replay and show cards keep QRIS/coin purchase but replace password/watch buttons with a contact-admin link; purchased links still redirect to replay_origin, so sales continue while sources stay hidden.
- Keep short titles on active_shows.short_title and copy them to replays in convert_show_to_replay plus a sync trigger, so admins set abbreviations once at show entry.
