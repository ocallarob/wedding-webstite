# Wedding Website (Next.js + Tailwind)

A minimal, mobile-first wedding site built with the Next.js App Router, TypeScript, and Tailwind. All editable content lives in `src/content/site.ts`.

## Getting started

```bash
pnpm install
pnpm dev
# open http://localhost:3000
```

Required env var for RSVP submissions (used client-side):

```
NEXT_PUBLIC_RSVP_API_BASE=<your API Gateway base URL, no trailing slash needed>
```

## Content editing

- Update names, dates, locations, gallery image paths, weekend schedule, travel info, and FAQ in `src/content/site.ts`.
- Drop your own photos into `public/photos/` to replace the placeholders (paths already referenced in content).

## Deployment (Vercel)

1. Set `NEXT_PUBLIC_RSVP_API_BASE` in your Vercel project settings.
2. Deploy as a standard Next.js app; no custom build steps beyond `pnpm run build`.

## Deployment (AWS S3 + CloudFront)

This repo includes a CDK stack that stands up static hosting behind CloudFront plus the RSVP API.

1. `cd infra && pnpm install && pnpm cdk synth && pnpm cdk deploy` to create the S3 bucket, CloudFront distribution (with a viewer-request redirect that forces everything to `/save-the-date`), DynamoDB table, Lambda, and API Gateway endpoint. Grab the `SiteBucketName`, `SiteDistributionDomain`, and `ApiBaseUrl` outputs.
2. Build and export the site, then upload to the bucket (ex: `pnpm run build && pnpm exec next export -o out && aws s3 sync ./out s3://<SiteBucketName>/`). If `next export` complains about `middleware`, temporarily move `middleware.ts` aside while exporting—the CloudFront function handles the redirect in production.
3. Set `NEXT_PUBLIC_RSVP_API_BASE` to the deployed `ApiBaseUrl` (or a custom domain that fronts it).
4. Invalidate CloudFront after uploading when you push changes: `aws cloudfront create-invalidation --distribution-id <id> --paths \"/*\"`.

## Pages

- `/` – hero, quick info, CTAs to weekend/travel/RSVP.
- `/gallery` – photo grid with modal.
- `/weekend` – Day 0/1/2 schedule.
- `/travel` – area guide, accommodations, getting-there tips, FAQ, copy-to-clipboard map link.
- `/rsvp` – form posting to `${NEXT_PUBLIC_RSVP_API_BASE}/rsvp` with loading/success/error states and a honeypot field.
