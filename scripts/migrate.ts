import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS guests (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      email       TEXT NOT NULL UNIQUE,
      token       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      invited_at  TIMESTAMPTZ
    )
  `;

  await sql`
    ALTER TABLE guests
    ADD COLUMN IF NOT EXISTS partner_name TEXT
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS rsvps (
      token                 UUID PRIMARY KEY REFERENCES guests(token),
      attending_day1        BOOLEAN NOT NULL DEFAULT false,
      attending_day2        BOOLEAN NOT NULL DEFAULT false,
      dietary               TEXT,
      song                  TEXT,
      message               TEXT,
      submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    ALTER TABLE rsvps
    ADD COLUMN IF NOT EXISTS partner_attending_day1 BOOLEAN
  `;

  await sql`
    ALTER TABLE rsvps
    ADD COLUMN IF NOT EXISTS partner_attending_day2 BOOLEAN
  `;

  await sql`
    ALTER TABLE rsvps
    ADD COLUMN IF NOT EXISTS partner_dietary JSONB
  `;

  // Migrate existing dietary text to JSONB format {options: [], other: ""}
  await sql`
    ALTER TABLE rsvps
    ALTER COLUMN dietary TYPE JSONB USING
      CASE
        WHEN dietary IS NULL THEN NULL
        ELSE jsonb_build_object('options', '[]'::jsonb, 'other', dietary)
      END
  `;

  console.log('Migration complete');
}

migrate().catch((err) => { console.error(err); process.exit(1); });
