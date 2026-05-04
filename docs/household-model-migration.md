# Household Model Migration (V2)

## Goal
Support singles, couples, and families (including children) with one consistent model.

## New Tables
- `households`: invite group, contact email, invite token
- `household_members`: one row per person in a household
- `household_rsvps`: shared free-text RSVP metadata (song/message/submitted_at)

## Backward Compatibility
Current tables (`guests`, `rsvps`) remain active and unchanged.
No existing invite links or RSVP flows are broken by this migration.

## Rollout Plan
1. Run migration (`pnpm db:migrate`) in each environment.
2. Add write path for new invites into `households` + `household_members`.
3. Add RSVP read/write path for household token flow.
4. Update dashboard to prefer household view; keep legacy fallback while migrating.
5. Backfill existing `guests`/`rsvps` to household tables when ready.
6. Remove legacy tables only after full cutover (optional, later).

## Data Mapping for Backfill
- `households.contact_email` = `guests.email`
- `households.label` = `guests.name` + optional partner name
- `household_members`:
  - primary member from `guests.name`
  - second member when `partner_name` exists
  - attendance/dietary from `rsvps` columns
- `household_rsvps` from `rsvps.song`, `rsvps.message`, `rsvps.submitted_at`
