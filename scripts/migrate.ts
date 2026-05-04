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
      contact_email          TEXT NOT NULL UNIQUE,
      label                  TEXT,
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

  console.log('Migration complete');
}

migrate().catch((err) => { console.error(err); process.exit(1); });
