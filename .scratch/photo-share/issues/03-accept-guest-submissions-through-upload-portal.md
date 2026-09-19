# 03: Accept guest submissions through Upload portal

**What to build:** Let a household contact select multiple photographs or videos in one Upload portal visit, transfer them directly to private storage, and receive per-asset progress, success, and failure feedback. Each successful contribution becomes a Pending submission associated with the household authorized by the portal and is confirmed as awaiting review.

**Blocked by:** 02: Open household-scoped Upload portal

**Status:** ready-for-agent

- [ ] The server validates allowed photo/video media types, configured per-asset byte limits, and configured per-visit asset-count limits before storage work where possible; rejected assets receive actionable validation errors.
- [ ] Direct browser-to-private-storage transfer reports independent progress and error states for each selected asset, so one failure does not hide other outcomes.
- [ ] Successful contributions create Pending submissions associated with the authorized household and return a clear awaiting-review confirmation; they remain invisible to gallery viewers.
- [ ] A valid portal capability cannot create a submission for another household, attendance does not gate contribution, and contact email or household details are not exposed through viewer-facing responses.
- [ ] Contribution initiation and callbacks are rate-limited, provider and callback failures return safe actionable errors, and route-boundary coverage proves authorization, validation, persistence, and pending visibility behavior.
