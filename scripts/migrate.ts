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
      evening_invite         BOOLEAN NOT NULL DEFAULT false,
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
  await sql`ALTER TABLE households ADD COLUMN IF NOT EXISTS evening_invite BOOLEAN NOT NULL DEFAULT false`;
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

  await sql`
    CREATE TABLE IF NOT EXISTS gallery_capabilities (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_hash   TEXT NOT NULL UNIQUE,
      expires_at   TIMESTAMPTZ NOT NULL,
      revoked_at   TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS gallery_capabilities_active_idx
    ON gallery_capabilities (expires_at)
    WHERE revoked_at IS NULL
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS upload_portal_capabilities (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id  UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      token_hash    TEXT NOT NULL UNIQUE,
      expires_at    TIMESTAMPTZ NOT NULL,
      revoked_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`ALTER TABLE upload_portal_capabilities ADD COLUMN IF NOT EXISTS upload_visit_started_at TIMESTAMPTZ`;
  await sql`ALTER TABLE upload_portal_capabilities ADD COLUMN IF NOT EXISTS upload_visit_asset_count INTEGER NOT NULL DEFAULT 0`;

  await sql`
    CREATE INDEX IF NOT EXISTS upload_portal_capabilities_active_idx
    ON upload_portal_capabilities (household_id, expires_at)
    WHERE revoked_at IS NULL
  `;


  await sql`
    CREATE TABLE IF NOT EXISTS gallery_upload_sessions (
      id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id           UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      capability_token_hash  TEXT NOT NULL,
      asset_count            INTEGER NOT NULL CHECK (asset_count > 0),
      issued_count           INTEGER NOT NULL DEFAULT 0 CHECK (issued_count >= 0),
      expires_at              TIMESTAMPTZ NOT NULL,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS gallery_upload_sessions_active_idx
    ON gallery_upload_sessions (household_id, expires_at)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS gallery_assets (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      public_key          TEXT NOT NULL UNIQUE,
      household_id        UUID REFERENCES households(id) ON DELETE SET NULL,
      storage_key         TEXT NOT NULL UNIQUE,
      media_type          TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
      content_type        TEXT NOT NULL,
      size_bytes          BIGINT NOT NULL CHECK (size_bytes >= 0),
      display_name        TEXT NOT NULL,
      moderation_status   TEXT NOT NULL DEFAULT 'pending'
        CHECK (moderation_status IN ('pending', 'published', 'rejected', 'removed')),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at        TIMESTAMPTZ,
      rejected_at         TIMESTAMPTZ,
      removed_at          TIMESTAMPTZ,
      cleanup_error       TEXT
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS gallery_assets_viewer_idx
    ON gallery_assets (moderation_status, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS gallery_assets_household_idx
    ON gallery_assets (household_id, created_at DESC)
  `;

  console.log('Migration complete');
}

migrate().catch((err) => { console.error(err); process.exit(1); });
