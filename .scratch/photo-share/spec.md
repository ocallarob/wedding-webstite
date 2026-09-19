# Event gallery and guest photo sharing

Status: ready-for-agent

## Problem Statement

After the wedding, the couple needs one event gallery where wedding media can be shared with eligible wedding households and where guests can contribute additional photographs or videos. The current gallery surface is a hard-coded collection of public site imagery. It has no gallery link authorization, Upload portal, guest submission workflow, moderation state, private asset storage, or Gallery announcement.

The couple also needs control over who receives the post-wedding message. A Gallery announcement must reach only gallery-eligible households: households with a contact email and at least one member recorded as attending at least one wedding day. The gallery link itself should remain semi-private: possession of the link grants viewing access without creating accounts or requiring identity checks.

## Solution

Replace the current gallery surface with a post-wedding event gallery backed by private Vercel Blob storage. Viewers enter through an unlisted gallery link and receive short-lived signed URLs for published assets. The application never proxies gallery media and never exposes public Blob URLs.

Provide a household-scoped Upload portal for the person who controls a household's listed contact email. Each contributed asset becomes a pending submission and remains invisible until an administrator publishes it. Administrators use the existing protected dashboard/session model to review, publish, reject, or remove submissions.

Add a manual, throttled Gallery announcement action that sends a distinct post-wedding email to gallery-eligible households. Successful sends are recorded so rerunning the action does not duplicate them; failed sends remain retryable and visible to the administrator.

## User Stories

1. As a gallery viewer, I want to open the event gallery from a gallery link, so that I can see the wedding media shared after the wedding.
2. As a gallery viewer, I want the event gallery to be unlisted, so that people who do not have the gallery link do not discover it through normal site navigation or search.
3. As a gallery viewer, I want to use the gallery link without creating an account or proving my identity, so that viewing remains simple for household members and their guests.
4. As a gallery viewer, I want an invalid or missing gallery link to be rejected, so that the event gallery is not accidentally exposed as a public collection.
5. As a gallery viewer, I want to see published assets only, so that pending submissions are not visible before moderation.
6. As a gallery viewer, I want photographs and videos presented in a responsive event gallery, so that the experience works on phones, tablets, and desktop screens.
7. As a gallery viewer, I want a clear empty state when no published assets exist, so that an empty gallery does not look broken.
8. As a gallery viewer, I want to preview a published photograph or video, so that I can decide whether it is worth downloading.
9. As a gallery viewer, I want to download one published asset at a time, so that I can save the specific media I want without an ambiguous bulk operation.
10. As a gallery viewer, I want each download to use a short-lived direct URL, so that media access expires and the application does not proxy large assets.
11. As a gallery viewer, I want the event gallery to provide no multi-select or bulk download control, so that storage and bandwidth remain bounded by the intended single-asset download experience.
12. As a household contact, I want a household-scoped Upload portal link, so that I can contribute photographs or videos on behalf of my household.
13. As a household contact, I want the Upload portal authorization to be separate from the RSVP invite token, so that sharing an RSVP link does not automatically grant contribution access.
14. As a household contact, I want Upload portal access to work even when my household did not attend, so that attendance controls Gallery announcement eligibility but does not block a legitimate guest submission.
15. As a household contact, I want to contribute multiple assets during one Upload portal visit, so that I do not need to repeat the entire process for every photograph or video.
16. As a household contact, I want unsupported media types and over-limit assets rejected before transfer, so that I receive actionable feedback and do not waste bandwidth.
17. As a household contact, I want each selected asset to show transfer progress and its own error state, so that one failed asset does not hide the outcome of the others.
18. As a household contact, I want a confirmation that my contribution is a pending submission, so that I know it is awaiting review rather than already visible in the event gallery.
19. As a household contact, I want the Upload portal to avoid exposing my contact email or household details to gallery viewers, so that contribution metadata remains appropriately private.
20. As a household contact, I want an expired, revoked, or malformed Upload portal link to fail clearly, so that an unauthorized person cannot contribute under my household.
21. As an administrator, I want every guest submission associated with the household whose Upload portal authorized it, so that I can understand the source of a contribution during review.
22. As an administrator, I want to see pending submissions with their media preview and basic metadata, so that I can moderate them without downloading every asset manually.
23. As an administrator, I want to publish a pending submission, so that it becomes a published asset visible through the event gallery.
24. As an administrator, I want to reject a pending submission, so that unsuitable media never appears in the event gallery.
25. As an administrator, I want to remove a published asset, so that I can correct a moderation decision or respond to a privacy concern after publication.
26. As an administrator, I want rejected submissions excluded from every viewer response, so that moderation state is enforced at the server boundary rather than only in the interface.
27. As an administrator, I want moderation actions protected by the existing administrator session and CSRF checks, so that an outsider cannot publish, reject, or remove assets.
28. As an administrator, I want a preview of the Gallery announcement before sending it, so that the post-wedding message is distinct from an invitation or RSVP reminder.
29. As an administrator, I want the Gallery announcement sent only to gallery-eligible households, so that households without a contact email or without an attending member are not included.
30. As an administrator, I want paper-invite households without a contact email excluded from the Gallery announcement batch, so that the system does not attempt an undeliverable message.
31. As an administrator, I want the Gallery announcement to include the gallery link and the appropriate household Upload portal link, so that recipients can both view and contribute.
32. As an administrator, I want a throttled announcement batch with sent and failed counts, so that the email provider and the application remain within safe operating limits.
33. As an administrator, I want successful Gallery announcements recorded per household, so that rerunning the batch does not send duplicates.
34. As an administrator, I want failed Gallery announcements to retain an error state and remain retryable, so that transient delivery failures do not require manual database edits.
35. As an administrator, I want to generate or resend a household Upload portal link when needed, so that a household contact can recover from a lost or expired link without granting access to another household.
36. As the couple, I want the existing household and RSVP records preserved, so that introducing the event gallery does not break invite links, RSVP submissions, or dashboard reporting.
37. As the couple, I want the event gallery media stored privately, so that copying or guessing a raw storage URL does not provide permanent access.
38. As the couple, I want application-level throttling on signed-URL issuance and contribution initiation, so that accidental refreshes or abuse do not create uncontrolled storage or download costs.
39. As a gallery viewer using assistive technology, I want gallery controls, media descriptions, loading states, and errors exposed accessibly, so that the event gallery is usable without relying on visual cues alone.
40. As a gallery viewer, I want the event gallery to remain usable when a browser cannot preview a particular video format, so that I can still use the single-asset download action.

## Implementation Decisions

- Continue using the household model as the source of gallery eligibility and contribution ownership. Do not introduce user accounts, household accounts, or a second identity system.
- Add a gallery asset/submission data model associated with a household where the asset came through the Upload portal. Store storage key, media type, content type, size, original display name, moderation status, and lifecycle timestamps. Use explicit states for pending submission, published asset, and rejected submission.
- A pending submission is never returned by the viewer-facing gallery contract. Publishing is the only transition that makes it visible. Rejection and removal make the asset unavailable to viewers and clean up its private storage object where safe.
- Give each household with a contact email a separate scoped Upload portal capability. It must be distinct from the RSVP invite token, revocable, and bounded by an expiry or equivalent server-side validity check. Attendance must not be part of Upload portal authorization.
- Use a separate unlisted gallery-link capability for viewing. Possession of a valid gallery link grants access; the viewer is not required to identify as a household or member. Do not list the event gallery in public navigation or expose household data through it.
- Keep all event gallery media in a private Vercel Blob store, as required by the accepted media-storage ADR. Store only private storage identifiers in the database. Issue short-lived signed URLs for previews and single-asset downloads after gallery-link authorization. Never proxy media through the application and never publish event gallery media under the public static asset tree.
- Use direct browser-to-Blob transfer through a server-issued upload capability or the provider's equivalent. The server must validate the authorized household, allowed photo/video media type, configured per-asset size limit, and configured per-visit asset-count limit before accepting a guest submission. Client-side checks are supplementary, not authoritative.
- Throttle gallery signed-URL issuance, Upload portal initiation, and contribution callbacks using the existing database-backed rate-limit pattern. Return stable rate-limit errors without revealing household existence or storage details.
- Replace the existing static gallery content on the event gallery surface with published asset data. Existing site imagery used by the home and story experience is not automatically copied into the event gallery or migrated into private Blob storage by this feature.
- Reuse the existing administrator session, secret, same-origin, and CSRF protections for moderation and announcement mutations. Do not expose moderation actions through the gallery link or Upload portal.
- Add administrator controls for reviewing pending submissions, publishing, rejecting, and removing assets. Viewer responses must enforce moderation state server-side even if an old page or cached client requests a previously pending asset.
- Define gallery eligibility exactly as: a household has a non-empty contact email and at least one household member with attendance recorded for at least one wedding day. Missing attendance, negative attendance, paper-invite households without contact email, and households with no attending member are excluded from Gallery announcement recipients.
- Add a distinct Gallery announcement workflow using the existing email provider and throttled-batch behavior. It is manually triggered by an administrator after the wedding; it is not a scheduled job and is not folded into invitation or RSVP-reminder sending.
- Record Gallery announcement status per household, including successful send time and failure information sufficient for retry and dashboard feedback. A successful household is skipped on later runs; failed households remain eligible for retry.
- The Gallery announcement includes the gallery link and a household-scoped Upload portal link. Link generation must not expose raw database identifiers or another household's capability.
- Make the database migration additive and idempotent. New gallery records reference households with referential integrity; existing RSVP flows, invite tokens, dashboard household data, and email workflows remain functional without backfill.
- Keep finite media-count, byte-size, and provider-cost limits in one server-side configuration surface. The limits must be enforced before storage work where possible and surfaced as clear user-facing validation errors.
- Preserve responsive, keyboard-accessible gallery and Upload portal interactions, including visible loading, empty, invalid-link, expired-link, transfer-failure, moderation-pending, and provider-failure states.

## Testing Decisions

- Use one primary seam: the gallery workflow's HTTP/application boundary. Exercise viewer access, Upload portal contribution, moderation transitions, single-asset download authorization, and Gallery announcement commands through their externally observable request/response behavior. Use controlled database, Blob, and email-provider doubles only at external boundaries; do not create separate unit-test seams for every storage operation or UI component.
- A good test asserts what a viewer, household contact, administrator, or email provider observes: response status and shape, visible/published state, authorization result, sent/failed counts, retry behavior, and persistence-visible state. Tests must not assert SQL text, component structure, internal token encoding, or incidental copy.
- Test gallery authorization boundaries: valid gallery link returns published assets; missing, malformed, expired, or revoked credentials are rejected; pending and rejected submissions never appear; returned media access is short-lived and direct rather than a public storage URL.
- Test Upload portal boundaries: a valid household capability accepts allowed photographs and videos as pending submissions; a capability for one household cannot create a submission for another; attendance does not gate contribution; malformed capabilities, unsupported media types, over-limit assets, rate limits, and callback failures produce safe errors.
- Test moderation transitions: publishing exposes exactly that asset to the gallery; rejection does not expose it; removal withdraws a previously published asset; repeated moderation commands are safe and do not create duplicate published records.
- Test Gallery announcement eligibility at the boundary cases defined by the glossary: attending household with contact email is included; non-attending household is excluded; missing attendance is excluded; paper-invite household without contact email is excluded; multiple attending members still produce one household recipient.
- Test announcement idempotency and failure handling: a successful recipient is not sent twice on rerun; failed recipients are reported and retryable; a throttled batch reports sent and failed counts without aborting all remaining households after one failure.
- Test administrator protection: unauthenticated and invalid-CSRF moderation/announcement mutations are rejected, while valid existing administrator sessions can perform the intended actions.
- Use the repository's existing Vitest prior art for security/session, RSVP validation, rate-limit, and throttled-batch behavior. Add the smallest route-boundary coverage needed for the new externally visible workflow rather than broad component or database plumbing suites.
- Perform one browser smoke check of the event gallery and Upload portal for responsive layout, keyboard access, media preview/download affordances, and the primary empty/error states after the server behavior is covered.

## Out of Scope

- User accounts, household login, identity verification, or a general-purpose authentication system.
- Public gallery listing, search indexing, social sharing discovery, or identity-restricted viewer access beyond possession of the gallery link.
- Albums, gallery sections, tags, comments, reactions, favorites, captions requiring editorial workflows, or face/person identification.
- Automatic moderation, AI content classification, or automatic publication of guest submissions.
- Multi-select or bulk downloads, archive generation, or a download-all operation.
- Application-side media proxying, permanent public Blob URLs, or storing new event gallery media under public static assets.
- Automatic scheduled Gallery announcements, push notifications, SMS, or a new email-delivery provider.
- Changes to RSVP questions, invite tokens, household membership semantics, or existing invitation/reminder behavior.
- Automatic migration of existing bundled site imagery into the event gallery.
- Video transcoding, image editing, generated alternate sizes, or a media-processing pipeline beyond provider-native preview/download behavior.

## Further Notes

- The accepted private-media ADR is directly applicable and is not contradicted: private Vercel Blob storage, short-lived signed URLs, application-level throttling, and provider spend controls are mandatory decisions for this feature.
- Gallery announcement eligibility and Upload portal authorization are intentionally different. Attendance determines who receives the announcement; possession of a valid household-scoped contribution capability determines who may submit, including a household that did not attend.
- The current site already has household data, administrator sessions, CSRF checks, database-backed throttling, Resend delivery, and throttled batch behavior. The implementation should extend those patterns rather than introduce parallel infrastructure.
- Provider-specific byte/count thresholds should be conservative, explicit, and documented with the deployment configuration before the Upload portal is enabled. The product contract requires finite server-side limits but does not require those limits to be user-configurable.
