# 01: Establish private event gallery viewing

**What to build:** Replace the current static gallery behavior with an unlisted event gallery that a valid Gallery link opens. Viewers can see only Published assets, preview photographs and videos, and perform one single-asset download at a time. Gallery media remains in private Vercel Blob storage and is accessed through short-lived direct signed URLs; the application never proxies media, exposes public storage URLs, or offers bulk downloads. Existing site imagery is not copied into the event gallery, and existing RSVP and household flows continue to work.

**Blocked by:** None (can start immediately)

**Status:** resolved


- [x] A valid Gallery link opens the event gallery and returns only Published assets; missing, malformed, expired, or revoked Gallery links are rejected with a safe stable response.
- [x] Photograph and video preview/download actions use short-lived direct signed URLs from private storage, with no public Blob URL, application media proxy, multi-select, or bulk-download control.
- [x] Pending submissions and rejected submissions never appear in viewer responses; the gallery has clear empty, loading, error, and unsupported-video fallback states.
- [x] The event gallery is responsive and keyboard-accessible, with media controls and errors exposed accessibly.
- [x] New persistence is additive and idempotent, and route-boundary coverage proves authorization, moderation filtering, and single-asset download behavior without breaking existing RSVP flows.


## Answer

Implemented the unlisted Gallery link flow, additive gallery persistence, published-asset filtering, short-lived private Vercel Blob URLs, single-asset download controls, accessible responsive states, and route-boundary coverage. `pnpm build` and `pnpm test` pass; browser smoke verified the invalid-link response and `noindex,nofollow` metadata.
