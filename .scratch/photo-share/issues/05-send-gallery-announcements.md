# 05: Send Gallery announcements

**What to build:** Let an administrator preview and manually send a distinct Gallery announcement containing the Gallery link and the appropriate household-scoped Upload portal link. The throttled batch targets exactly Gallery-eligible households and gives the administrator durable sent, failed, and retryable results.

**Blocked by:** 01: Establish private event gallery viewing; 02: Open household-scoped Upload portal

**Status:** resolved

- [x] The preview and sent message are distinct from invitation and RSVP-reminder messaging, and the workflow is manually triggered rather than scheduled.
- [x] Recipients have a non-empty contact email and at least one member recorded as attending at least one wedding day; non-attending, missing-attendance, no-attending-member, and paper-invite households without email are excluded, with one recipient per household.
- [x] Each message contains the Gallery link and the correct household-scoped Upload portal link without exposing raw identifiers or another household's capability.
- [x] The batch uses throttled delivery, reports sent and failed counts, continues after individual provider failures, and surfaces durable dashboard feedback.
- [x] Successful sends are recorded and skipped on reruns; failed sends retain sufficient error state for retry; route-boundary coverage proves eligibility, idempotency, failure handling, and administrator protection.

## Answer

Implemented the manual Gallery announcement workflow:

- Added a distinct announcement email template and HTML-only preview route.
- Added exact household eligibility filtering, one-recipient-per-household delivery, throttled Resend sending, Gallery and household-scoped Upload portal links, and administrator session/same-origin/CSRF protection.
- Added durable per-household sent, in-progress, and retryable failure state, atomic claims with provider idempotency keys, dashboard controls/statuses, and an additive idempotent migration.
- Added route-boundary coverage for eligibility, link scoping, provider failures, continuation, idempotency, and administrator protection.
