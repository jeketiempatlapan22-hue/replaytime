# Project Architecture Rules

- Resolve buyer groups through the shared group-link helper: tokens inherit show/package groups unless their nullable override replaces or explicitly removes one, so reseller groups never alter other buyers.

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
- Store Maintenance Mode per domain in site_settings `maintenance_mode:<host without www>` via src/lib/maintenance.ts (legacy maintenance_mode+maintenance_origin only read), so Website A and B toggle independently while access rules stay shared.
- get_my_memberships also returns membership_tokens whose phone matches the user's profile phone, so admin/reseller-made memberships unlock watch buttons on the account.
- Store Server 2 links on active_shows.server2_url and deliver them only through unlock-live after access is verified, so direct m3u8 links (no proxy) are never publicly readable.
- Fill active_shows.server2_url (SForge master) and server3_url (SForge master-final) via _shared/sforge.ts from unlock-live (when empty) and the manage-live sforge_sync action, never overwriting non-SForge manual links, so admins never copy links from the SForge dashboard.

- Server 3 (SForge master-final) runs HlsPlayer in `dvr` mode on Live (full back buffer, no edge jumps) and is the default first replay source before YouTube, so viewers can rewind live and replays play without manual setup.
- Compute show/bundle token expiry only in DB triggers on active_show_tokens/show_bundle_tokens (follow show reschedules) and purge hourly via purge_expired_membership_tokens, so every issuing path shares one rule.
- Keep token retention separate from access expiry via token_cleanup_at, so admin history never grants extra viewing time.
- Restore deleted-source tokens into admin-only token_factory_history; restore a show only from original backup metadata as inactive, never infer buyer identities from reseller phones or revive expired access.
- Paginate recovered token history and resolve owner metadata only from matching orders/profiles, so large recovery batches remain complete and buyer identities are not fabricated.
- Insert live messages and private sender metadata atomically through a service-role-only RPC; resolve account information only in admin RPCs, so missing metadata cannot silently accompany successful chat sends.
- Live chat messages are sent only through the live-chat-send edge function, which records sender identity privately in live_message_senders (service-role only) and sets live_messages.sender_role; chat moderation (delete/block/unblock, moderator management) goes through SECURITY DEFINER RPCs (mod_*, admin_set_moderator), so phone numbers never reach clients and moderator rights stay server-enforced.

- Pakasir stays the live payment path until DOKU is activated and tested; DOKU code lives in separate doku-* functions and is switched in only then.
- Use DOKU SNAP through the shared server-only adapter for all QR creation and strict status verification; retain legacy invoice columns for compatibility, query stored references (never create during verification), and reject sandbox fulfillment so old orders and test charges cannot grant new access.
