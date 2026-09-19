# 02: Open household-scoped Upload portal

**What to build:** Let an administrator generate, resend, and revoke a separate Upload portal capability for a household with a listed contact email. A valid portal link opens the household-scoped contribution surface regardless of attendance, while an RSVP token never grants Upload portal access. Portal links and invalid-link responses do not expose raw identifiers or household details.

**Blocked by:** 01: Establish private event gallery viewing

**Status:** ready-for-agent

- [ ] An authorized administrator can generate, resend, and revoke an Upload portal capability only for a household with a contact email, and generated links do not expose raw database identifiers or another household's capability.
- [ ] A valid Upload portal capability authorizes the intended household without requiring attendance, user accounts, or identity verification; the RSVP invite token is not accepted as a substitute.
- [ ] Malformed, expired, revoked, and mismatched capabilities fail clearly without revealing whether another household exists or exposing contact information to unauthorized viewers.
- [ ] Portal initiation is application-rate-limited with stable safe errors, and administrator capability mutations use the existing administrator session, same-origin, and CSRF protections.
- [ ] The portal's initial loading, invalid-link, expired-link, and authorization-error states are usable with keyboard and assistive technology.
