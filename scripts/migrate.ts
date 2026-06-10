import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  // Full cutover: legacy model is no longer used.
  await sql`DROP TABLE IF EXISTS rsvps`;
  await sql`DROP TABLE IF EXISTS guests`;

  await sql`
    CREATE TABLE IF NOT EXISTS households (
      id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invite_token           UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      contact_email          TEXT UNIQUE,
      address_line_one       TEXT,
      label                  TEXT,
      is_paper_invite        BOOLEAN NOT NULL DEFAULT false,
      invited_at             TIMESTAMPTZ,
      invite_failed_count    INTEGER NOT NULL DEFAULT 0,
      last_invite_failed_at  TIMESTAMPTZ,
      reminder_count         INTEGER NOT NULL DEFAULT 0,
      reminder_failed_count  INTEGER NOT NULL DEFAULT 0,
      last_reminder_at       TIMESTAMPTZ,
      last_reminder_failed_at TIMESTAMPTZ,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`ALTER TABLE households ADD COLUMN IF NOT EXISTS last_invite_error TEXT`;
  await sql`ALTER TABLE households ADD COLUMN IF NOT EXISTS address_line_one TEXT`;
  await sql`ALTER TABLE households ALTER COLUMN contact_email DROP NOT NULL`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS households_paper_address_line_one_idx
    ON households (lower(address_line_one))
    WHERE is_paper_invite = true AND address_line_one IS NOT NULL
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS household_members (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id         UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      full_name            TEXT NOT NULL,
      member_type          TEXT NOT NULL DEFAULT 'adult',
      attending_day1       BOOLEAN,
      attending_day2       BOOLEAN,
      dietary              JSONB,
      sort_order           INTEGER NOT NULL DEFAULT 0,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS household_members_household_idx
    ON household_members (household_id, sort_order, created_at)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS household_rsvps (
      household_id          UUID PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
      song                  TEXT,
      message               TEXT,
      submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS household_rsvp_opens (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id          UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      opened_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      ip_address            TEXT,
      user_agent            TEXT
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS household_rsvp_opens_household_idx
    ON household_rsvp_opens (household_id, opened_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      key                   TEXT NOT NULL,
      window_start          TIMESTAMPTZ NOT NULL,
      count                 INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key, window_start)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS api_rate_limits_window_start_idx
    ON api_rate_limits (window_start)
  `;

  console.log('Migration complete');
}

migrate().catch((err) => { console.error(err); process.exit(1); });
