# Wedding Invite Service (Next.js + Postgres + Resend)

Household-based wedding invite + RSVP system.
Supports singles, couples, and families (adults + children) with one invite token per household.

- Next.js 14 App Router
- Vercel Postgres (Neon)
- Private Vercel Blob + Vercel Queues for gallery storage and processing
- Resend for email delivery

## Quick Start

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Required Environment Variables

Set these in `.env.local` (local) and Vercel (Preview/Production):

```bash
DATABASE_URL=...
RESEND_API_KEY=...
ADMIN_SECRET=...
NEXT_PUBLIC_BASE_URL=https://alannah-rob.ie
PAPER_RSVP_CODE=your-shared-paper-invite-code
GALLERY_ACCESS_TOKEN=...       # distinct high-entropy value, 32+ chars
GALLERY_SESSION_SECRET=...     # distinct high-entropy value, 32+ chars
GALLERY_ALERT_EMAIL=...
GALLERY_STORAGE_WARNING_BYTES= # optional; defaults to 25 GiB
GALLERY_STORAGE_LIMIT_BYTES=   # optional; defaults to 30 GiB
CRON_SECRET=...                # 32+ chars
```

Private Blob storage also requires the Vercel-provided `BLOB_STORE_ID` and
`BLOB_WEBHOOK_PUBLIC_KEY`. Keep `BLOB_READ_WRITE_TOKEN` server-side and use it
only for the local table-camera import with `--apply`.

Notes:
- `ADMIN_SECRET` is used for dashboard login and admin API actions.
- `NEXT_PUBLIC_BASE_URL` is used in RSVP and gallery email links.
- `PAPER_RSVP_CODE` gates the paper-invite lookup page (`/rsvp/paper?code=...`).
- Gallery access/session secrets must be distinct and must never be committed.
- For real recipients, keep `NEXT_PUBLIC_BASE_URL` on your branded domain (not preview/tunnel).

## Database

Current model:
- `households`
- `household_members`
- `household_rsvps`
- `household_rsvp_opens`
- `gallery_storage_state`
- `gallery_browsers`
- `gallery_photos`
- `gallery_email_deliveries`

Run schema migration:

```bash
pnpm db:migrate
```

Seed test data:

```bash
pnpm db:seed
```

## CSV Guest Import

Template:
- `samples/households-template.csv`

Columns:
- `contact_email` (required for email invites; optional for paper invites)
- `address_line_one` (required for paper invites when `contact_email` is blank)
- `label` (optional display label)
- `members` (required, `|` separated)
- `member_types` (optional, `|` separated; values: `adult` or `child`)
- `is_paper_invite` (optional; `true/false`, defaults to `false`)

Dry run:

```bash
pnpm db:import-households samples/households-template.csv
```

Apply import:

```bash
pnpm db:import-households samples/households-template.csv --apply
```

Behavior:
- Upsert household by `contact_email`, or by `address_line_one` for paper invites without email
- Replace member rows for imported households

Private address update:

```bash
pnpm tsx --env-file=.env.local scripts/update-household-addresses.ts private/households-append.csv
pnpm db:update-household-addresses
```

Behavior:
- Reads the same CSV structure
- Skips rows without `address_line_one`
- Overwrites `households.address_line_one` for matched rows and sets `is_paper_invite` to `true`
- Matches email rows by `contact_email`; matches paper rows without email by label/member list or current address

## Core Routes

- `/rsvp?token=...`
  Family-capable 3-step RSVP wizard:
  1. attendance per member (Day 1 + Day 2)
  2. dietary per member
  3. song/message

- `/rsvp/paper?code=...`
  QR-code entry for paper invites and continuation into the normal RSVP flow.

- `/gallery/access?token=...`
  Shared-link redemption. A successful visit sets a persistent browser session
  cookie and redirects to `/gallery`.

- `/gallery`
  Soft-private gallery for browsing, batch JPEG uploads, and individual
  processed-photo downloads.

- `/dashboard`
  Admin-only, read-only RSVP summary and household table.

- `/dashboard/gallery`
  Admin-only gallery link, storage status, attending-household email selection,
  and manual link-copy actions for households without email.

Admin APIs:
- `GET /api/dashboard` (admin session)
- `POST /api/dashboard` (login or CSRF-protected logout only)
- `POST /api/gallery/admin/emails` (CSRF-protected, idempotent gallery delivery)

Table-camera import:

```bash
pnpm gallery:import /path/to/photos
pnpm gallery:import /path/to/photos --apply
```

The default is a dry run. `--apply` requires the private target Blob store token
and uses the same dedupe, quota, validation, and derivative-processing path as
guest uploads.


## Email + Deliverability Notes

Important:
- From-domain and RSVP link-domain should align where possible.
- Sending `@alannah-rob.ie` emails linking to random tunnel/preview domains can hit spam.

Recommended:
- SPF + DKIM passing
- DMARC configured (start with `p=none`)
- Send small batches first (10–20), then full send

## Preview Gotchas

If `/dashboard` access fails on preview:
1. Ensure preview auth/protection is satisfied.
2. Ensure preview env vars are set (`ADMIN_SECRET`, `DATABASE_URL`, etc.).
3. Ensure migration ran against the same preview `DATABASE_URL`.

Common error:
- `relation "households" does not exist` means migration was not run on that DB.

## Typical Go-Live Sequence

1. Confirm Vercel Pro, private Blob stores, Queues, and Node 22.
2. Set production environment variables, including gallery secrets and `CRON_SECRET`.
3. Run the production migration (`pnpm db:migrate` against the production DB).
4. Import table-camera photos with `pnpm gallery:import <directory>` (dry run), then `--apply`.
5. Verify RSVP behavior, shared-link redemption, gallery upload/processing, and recovery.
6. Send a small gallery pilot from `/dashboard/gallery`.
7. Send the remaining eligible-household gallery emails.

## Public Repo Safety Notes

- Never commit real secret values (`DATABASE_URL`, `RESEND_API_KEY`, `ADMIN_SECRET`, gallery secrets, or Blob tokens).
- Avoid committing real guest data exports or camera originals.
- Treat preview links, invite tokens, and the shared gallery URL as sensitive operational data.
