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
    CREATE TABLE IF NOT EXISTS rsvps (
      token           UUID PRIMARY KEY REFERENCES guests(token),
      attending_day1  BOOLEAN NOT NULL DEFAULT false,
      attending_day2  BOOLEAN NOT NULL DEFAULT false,
      dietary         TEXT,
      song            TEXT,
      message         TEXT,
      submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  console.log('Migration complete');
}

migrate().catch((err) => { console.error(err); process.exit(1); });
