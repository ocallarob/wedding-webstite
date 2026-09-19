# Wedding Invite Service (Next.js + Postgres + Resend)

Household-based wedding invite + RSVP system.
Supports singles, couples, and families (adults + children) with one invite token per household.

## Stack
- Next.js 14 App Router
- Vercel Postgres (Neon)
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
BLOB_READ_WRITE_TOKEN=...
```

Notes:
- `ADMIN_SECRET` is used for dashboard login and admin API actions.
- `NEXT_PUBLIC_BASE_URL` is used in email RSVP links.
- `BLOB_READ_WRITE_TOKEN` authenticates private Vercel Blob signed-URL issuance. On Vercel, a connected private store may use `BLOB_STORE_ID` with the platform-managed `VERCEL_OIDC_TOKEN` instead.
- The event gallery never serves Blob bytes through the application; `gallery_assets.storage_key` is signed into short-lived private URLs only.
- `PAPER_RSVP_CODE` gates the paper-invite lookup page (`/rsvp/paper?code=...`).
- For real recipients, keep `NEXT_PUBLIC_BASE_URL` on your branded domain (not preview/tunnel).

## Database

Current model (no legacy guest/partner dependency):
- `households`
- `household_members`
- `household_rsvps`
- `household_rsvp_opens`
- `gallery_capabilities`
- `upload_portal_capabilities`
- `gallery_assets`

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
  QR-code entry for paper invites:
  1. search by name/address
  2. one best match only (paper invite households only)
  3. continue into normal `/rsvp?token=...` flow

- `/upload?token=...`
  Household-scoped Upload portal entry. The capability is generated, resent, and revoked from the admin dashboard.

- `/dashboard`  
  Admin dashboard with:
  - guest-level summary counts
  - household table
  - send status
  - RSVP open tracking
  - household Upload portal controls

Invitation and RSVP reminder email sending is disabled. The dashboard has no
invite, reminder, or invite-resend controls; preview routes render HTML only.

Admin APIs:
- `GET /api/dashboard` (`x-admin-secret` header auth)

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

1. Confirm production env vars.
2. Run production migration (`pnpm db:migrate` against prod DB).
3. Import real households via CSV (dry-run, then apply).
4. Send one production smoke-test invite to yourself.
5. Verify RSVP submit + revisit/update + dashboard sync.
6. Send pilot batch.
7. Send full batch.

## Public Repo Safety Notes

- Never commit real secret values (`DATABASE_URL`, `RESEND_API_KEY`, `ADMIN_SECRET`).
- Avoid committing real guest data exports.
- Treat preview links and invite tokens as sensitive operational data.
