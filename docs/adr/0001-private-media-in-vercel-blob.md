---
status: accepted
---

# Use private Vercel Blob storage for gallery media

The event gallery will store media in a private Vercel Blob store and expose it through short-lived signed URLs after gallery authorization. Vercel was chosen over R2 and S3/CloudFront because this Vercel-hosted project favors lower operational overhead and expected downloads are limited; application-level throttling of signed-URL issuance plus Vercel spend alerts/pause provide cost guardrails. Media will not be proxied through the application or stored as public `/public` assets.
