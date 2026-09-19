# 04: Moderate guest submissions

**What to build:** Give administrators a protected dashboard view of Pending submissions with media previews and basic metadata, plus actions to publish, reject, or remove assets. Publishing makes exactly that asset visible in the event gallery; rejection and removal withdraw visibility and clean up private storage when safe.

**Blocked by:** 01: Establish private event gallery viewing; 03: Accept guest submissions through Upload portal

**Status:** ready-for-agent

- [ ] An administrator can review Pending submissions with their media preview, household association, display name, media type, size, and relevant timestamps.
- [ ] Publishing a Pending submission makes that Published asset available through the Gallery link, while rejection keeps it out of every viewer response.
- [ ] Removing a Published asset withdraws it from the event gallery and removes its private storage object when safe; stale or cached client requests cannot bypass server-side moderation state.
- [ ] Moderation mutations require the existing administrator session, same-origin, and CSRF protections; unauthenticated, cross-origin, and invalid-CSRF requests are rejected.
- [ ] Repeated publish, reject, and remove commands are safe and do not create duplicate Published records or inconsistent visible state, with route-boundary coverage for each transition.
