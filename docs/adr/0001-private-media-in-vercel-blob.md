---
status: accepted
---

# Use private Vercel Blob storage for gallery media

The event gallery will store media in a private Vercel Blob store and expose it through short-lived signed URLs after gallery authorization. Vercel was chosen over R2 and S3/CloudFront because this Vercel-hosted project favors lower operational overhead and expected downloads are limited; application-level throttling of signed-URL issuance plus Vercel spend alerts/pause provide cost guardrails. Media will not be proxied through the application or stored as public `/public` assets.

The importer uses Sharp to store a private WebP thumbnail up to 800 pixels wide; unsupported or failed conversions fall back to the original. Gallery list responses sign at most 48 preview URLs per page, under the list endpoint's 60-requests-per-minute limit. The per-asset URL endpoint remains for original lightbox/download URLs and preview refresh, under its 120-requests-per-minute limit. Preview URLs use Blob caching; originals use uncached signed URLs.
