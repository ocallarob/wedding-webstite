---
status: accepted
---

# Track Gallery activity by household

Gallery access remains a bearer link rather than personal sign-in, but each Gallery-eligible household receives a distinct Gallery link; forwarded use is attributed to that household, not to an individual. The link is separate from RSVP access because the RSVP `invite_token` authorizes RSVP reads and edits and is returned by the paper-code lookup. Record successful initial Gallery opens once per browser-tab session and issued download requests for each asset with timestamps indefinitely, without IP or user-agent data; show all-time household and per-asset summaries. Download requests record signed-URL issuance, not transfer completion, because private Blob delivery is direct. Tracking is best-effort and must not interrupt access; household links expire after one year and can be manually rotated. Announcement retries do not revoke capabilities, while explicit rotation revokes that household's prior links. The dashboard requires confirmation and reveals the replacement URL once in that household's Gallery-link cell with a copy action; the URL is not persisted.
