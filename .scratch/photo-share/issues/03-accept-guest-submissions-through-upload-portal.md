# 03: Accept guest submissions through Upload portal

**What to build:** Let a household contact select multiple photographs or videos in one Upload portal visit, transfer them directly to private storage, and receive per-asset progress, success, and failure feedback. Each successful contribution becomes a Pending submission associated with the household authorized by the portal and is confirmed as awaiting review.

**Blocked by:** 02: Open household-scoped Upload portal

**Status:** resolved

- [x] The server validates allowed photo/video media types, configured per-asset byte limits, and configured per-visit asset-count limits before storage work where possible; rejected assets receive actionable validation errors.
- [x] Direct browser-to-private-storage transfer reports independent progress and error states for each selected asset, so one failure does not hide other outcomes.
- [x] Successful contributions create Pending submissions associated with the authorized household and return a clear awaiting-review confirmation; they remain invisible to gallery viewers.
- [x] A valid portal capability cannot create a submission for another household, attendance does not gate contribution, and contact email or household details are not exposed through viewer-facing responses.
- [x] Contribution initiation and callbacks are rate-limited, provider and callback failures return safe actionable errors, and route-boundary coverage proves authorization, validation, persistence, and pending visibility behavior.

## Answer

Implemented the Upload portal submission flow:

- Added bounded multi-asset initiation, per-visit reservations, private Vercel Blob token generation, signed completion callbacks, and idempotent Pending asset persistence.
- Added server-side media, size, path, capability, session, callback, and rate-limit checks with safe provider errors.
- Added the multi-file client workflow with independent progress, success, failure, and awaiting-review states.
- Added route-boundary coverage for authorization, validation, household scoping, attendance-independent access, persistence, pending visibility, retry limits, provider failures, and callback rate limiting.

Focused verification passed: TypeScript check; 29 upload/gallery tests; lint with one pre-existing `app/travel/page.tsx` image warning; mobile browser smoke check for invalid and ready Upload portal states.
