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

  // --- Guest photo gallery -------------------------------------------------

  await sql`
    CREATE TABLE IF NOT EXISTS gallery_storage_state (
      id                      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      used_bytes              BIGINT NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
      reserved_bytes          BIGINT NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
      warning_threshold_bytes BIGINT,
      warning_claimed_at      TIMESTAMPTZ,
      warning_sent_at         TIMESTAMPTZ,
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`INSERT INTO gallery_storage_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;

  await sql`
    CREATE TABLE IF NOT EXISTS gallery_browsers (
      id          UUID PRIMARY KEY,
      raw_bytes   BIGINT NOT NULL DEFAULT 0 CHECK (raw_bytes >= 0),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS gallery_photos (
      id                     UUID PRIMARY KEY,
      browser_id             UUID REFERENCES gallery_browsers(id) ON DELETE SET NULL,
      source                 TEXT NOT NULL CHECK (source IN ('guest', 'table_cameras')),
      uploader_name          TEXT NOT NULL CHECK (char_length(uploader_name) BETWEEN 1 AND 80),
      original_filename      TEXT NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
      content_sha256         TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
      declared_raw_bytes     BIGINT NOT NULL CHECK (declared_raw_bytes > 0),
      actual_raw_bytes       BIGINT CHECK (actual_raw_bytes IS NULL OR actual_raw_bytes > 0),
      display_bytes          BIGINT CHECK (display_bytes IS NULL OR display_bytes > 0),
      thumbnail_bytes        BIGINT CHECK (thumbnail_bytes IS NULL OR thumbnail_bytes > 0),
      reserved_bytes         BIGINT NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
      width                  INTEGER,
      height                 INTEGER,
      status                 TEXT NOT NULL DEFAULT 'awaiting_upload'
                               CHECK (status IN ('awaiting_upload', 'processing', 'ready', 'failed', 'rejected')),
      processing_generation  INTEGER NOT NULL DEFAULT 1 CHECK (processing_generation >= 1),
      attempts               INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      failure_code           TEXT CHECK (failure_code IN (
                               'invalid_jpeg', 'size_mismatch', 'hash_mismatch',
                               'pixel_limit', 'derivative_too_large', 'processing_failed'
                             )),
      upload_expires_at      TIMESTAMPTZ NOT NULL,
      processing_lease_at    TIMESTAMPTZ,
      uploaded_at            TIMESTAMPTZ,
      published_at           TIMESTAMPTZ,
      recovery_enqueued_at   TIMESTAMPTZ,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (content_sha256)
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS gallery_photos_ready_filename_idx
    ON gallery_photos (lower(original_filename), id)
    WHERE status = 'ready'
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS gallery_photos_ready_uploaded_idx
    ON gallery_photos (uploaded_at, id)
    WHERE status = 'ready'
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS gallery_photos_pending_expiry_idx
    ON gallery_photos (upload_expires_at)
    WHERE status = 'awaiting_upload' AND uploaded_at IS NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS gallery_photos_recovery_idx
    ON gallery_photos (recovery_enqueued_at)
    WHERE status = 'awaiting_upload' AND uploaded_at IS NOT NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS gallery_photos_processing_lease_idx
    ON gallery_photos (processing_lease_at)
    WHERE status = 'processing'
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS gallery_email_deliveries (
      household_id      UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      request_id        UUID NOT NULL,
      recipient         TEXT NOT NULL,
      payload_sha256    TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
      status            TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'unknown')),
      provider_email_id TEXT,
      error             TEXT,
      started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at      TIMESTAMPTZ,
      PRIMARY KEY (household_id, request_id)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS gallery_email_deliveries_status_idx
    ON gallery_email_deliveries (status)
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS gallery_email_deliveries_sending_unique_idx
    ON gallery_email_deliveries (household_id)
    WHERE status = 'sending'
  `;

  await sql`ALTER TABLE households ADD COLUMN IF NOT EXISTS gallery_email_sent_at TIMESTAMPTZ`;
  await sql`ALTER TABLE households ADD COLUMN IF NOT EXISTS gallery_email_send_count INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE households ADD COLUMN IF NOT EXISTS gallery_email_failed_count INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE households ADD COLUMN IF NOT EXISTS last_gallery_email_failed_at TIMESTAMPTZ`;
  await sql`ALTER TABLE households ADD COLUMN IF NOT EXISTS last_gallery_email_error TEXT`;
  await sql`ALTER TABLE households ADD COLUMN IF NOT EXISTS last_gallery_email_recipient TEXT`;

  // Global lock order for every function below that touches more than one of
  // {gallery_photos, gallery_storage_state, gallery_browsers}: photo first,
  // then the storage singleton, then the browser row. Followed with no
  // exceptions so concurrent calls can never deadlock against each other.

  // Drop-before-create (not just CREATE OR REPLACE) because Postgres refuses to
  // change a function's RETURNS/OUT-parameter shape in place; each name is
  // unique in this schema so the argument-less form resolves unambiguously.
  await sql`DROP FUNCTION IF EXISTS reserve_gallery_photo`;
  await sql`
    CREATE OR REPLACE FUNCTION reserve_gallery_photo(
      p_id uuid,
      p_browser_id uuid,
      p_source text,
      p_uploader_name text,
      p_original_filename text,
      p_sha256 text,
      p_raw_bytes bigint,
      p_reserved_bytes bigint,
      p_browser_limit_bytes bigint,
      p_warning_bytes bigint,
      p_limit_bytes bigint
    ) RETURNS TABLE (
      outcome text,
      photo_id uuid,
      processing_generation integer,
      projected_bytes bigint,
      alert_claimed boolean,
      reservation_expires_at timestamptz
    ) LANGUAGE plpgsql AS $FN$
    DECLARE
      v_existing gallery_photos%ROWTYPE;
      v_existing_found boolean;
      v_state gallery_storage_state%ROWTYPE;
      v_browser_bytes bigint := 0;
      v_new_total bigint;
      v_claim boolean := false;
      v_generation integer;
      v_upload_expires timestamptz := now() + interval '24 hours';
    BEGIN
      SELECT * INTO v_existing FROM gallery_photos WHERE content_sha256 = p_sha256 FOR UPDATE;
      v_existing_found := FOUND;

      SELECT * INTO v_state FROM gallery_storage_state WHERE id = 1 FOR UPDATE;

      IF v_existing_found THEN
        IF v_existing.status = 'awaiting_upload' AND (
          (p_browser_id IS NOT NULL AND v_existing.browser_id = p_browser_id)
          OR (p_browser_id IS NULL AND v_existing.source = 'table_cameras' AND p_source = 'table_cameras')
        ) THEN
          RETURN QUERY SELECT 'retry'::text, v_existing.id, v_existing.processing_generation,
            v_state.used_bytes + v_state.reserved_bytes, false, v_existing.upload_expires_at;
          RETURN;
        END IF;

        IF v_existing.status = 'failed' AND (
          (p_browser_id IS NOT NULL AND v_existing.browser_id = p_browser_id)
          OR (p_browser_id IS NULL AND v_existing.source = 'table_cameras' AND p_source = 'table_cameras')
        ) THEN
          v_generation := v_existing.processing_generation + 1;
          -- original_filename/declared_raw_bytes are deliberately NOT overwritten:
          -- the retained original blob's pathname is derived from (id, original_filename),
          -- so renaming here would strand the old original unaccounted for.
          UPDATE gallery_photos
          SET status = 'awaiting_upload',
              processing_generation = v_generation,
              attempts = 0,
              uploader_name = p_uploader_name,
              actual_raw_bytes = NULL,
              display_bytes = NULL,
              thumbnail_bytes = NULL,
              width = NULL,
              height = NULL,
              failure_code = NULL,
              processing_lease_at = NULL,
              uploaded_at = NULL,
              published_at = NULL,
              recovery_enqueued_at = NULL,
              upload_expires_at = v_upload_expires,
              updated_at = now()
          WHERE id = v_existing.id;

          RETURN QUERY SELECT 'reserved'::text, v_existing.id, v_generation,
            v_state.used_bytes + v_state.reserved_bytes, false, v_upload_expires;
          RETURN;
        END IF;

        RETURN QUERY SELECT 'duplicate'::text, v_existing.id, v_existing.processing_generation,
          v_state.used_bytes + v_state.reserved_bytes, false, NULL::timestamptz;
        RETURN;
      END IF;

      IF p_browser_id IS NOT NULL THEN
        INSERT INTO gallery_browsers (id) VALUES (p_browser_id) ON CONFLICT (id) DO NOTHING;
        SELECT raw_bytes INTO v_browser_bytes FROM gallery_browsers WHERE id = p_browser_id FOR UPDATE;

        IF v_browser_bytes + p_raw_bytes > p_browser_limit_bytes THEN
          RETURN QUERY SELECT 'browser_quota'::text, NULL::uuid, NULL::integer,
            v_state.used_bytes + v_state.reserved_bytes, false, NULL::timestamptz;
          RETURN;
        END IF;
      END IF;

      v_new_total := v_state.used_bytes + v_state.reserved_bytes + p_reserved_bytes;
      IF v_new_total > p_limit_bytes THEN
        RETURN QUERY SELECT 'storage_quota'::text, NULL::uuid, NULL::integer,
          v_state.used_bytes + v_state.reserved_bytes, false, NULL::timestamptz;
        RETURN;
      END IF;

      BEGIN
        INSERT INTO gallery_photos (
          id, browser_id, source, uploader_name, original_filename, content_sha256,
          declared_raw_bytes, reserved_bytes, status, processing_generation, upload_expires_at
        ) VALUES (
          p_id, p_browser_id, p_source, p_uploader_name, p_original_filename, p_sha256,
          p_raw_bytes, p_reserved_bytes, 'awaiting_upload', 1, v_upload_expires
        );
      EXCEPTION WHEN unique_violation THEN
        -- Raced with a concurrent reservation of the identical content hash.
        RETURN QUERY SELECT 'duplicate'::text, NULL::uuid, NULL::integer,
          v_state.used_bytes + v_state.reserved_bytes, false, NULL::timestamptz;
        RETURN;
      END;

      IF p_browser_id IS NOT NULL THEN
        UPDATE gallery_browsers SET raw_bytes = raw_bytes + p_raw_bytes, updated_at = now() WHERE id = p_browser_id;
      END IF;

      IF v_new_total >= p_warning_bytes
         AND (
           v_state.warning_threshold_bytes IS DISTINCT FROM p_warning_bytes
           OR (v_state.warning_sent_at IS NULL AND v_state.warning_claimed_at IS NULL)
         ) THEN
        v_claim := true;
      END IF;

      UPDATE gallery_storage_state
      SET reserved_bytes = reserved_bytes + p_reserved_bytes,
          warning_threshold_bytes = CASE WHEN v_claim THEN p_warning_bytes ELSE warning_threshold_bytes END,
          warning_claimed_at = CASE WHEN v_claim THEN now() ELSE warning_claimed_at END,
          warning_sent_at = CASE WHEN v_claim THEN NULL ELSE warning_sent_at END,
          updated_at = now()
      WHERE id = 1;

      RETURN QUERY SELECT 'reserved'::text, p_id, 1, v_new_total, v_claim, v_upload_expires;
    END;
    $FN$
  `;

  await sql`DROP FUNCTION IF EXISTS record_gallery_upload`;
  await sql`
    CREATE OR REPLACE FUNCTION record_gallery_upload(
      p_photo_id uuid,
      p_generation integer,
      p_actual_raw_bytes bigint,
      p_uploaded_at timestamptz
    ) RETURNS void LANGUAGE plpgsql AS $FN$
    DECLARE
      v_photo gallery_photos%ROWTYPE;
    BEGIN
      SELECT * INTO v_photo FROM gallery_photos WHERE id = p_photo_id FOR UPDATE;
      IF NOT FOUND OR v_photo.processing_generation <> p_generation OR v_photo.status <> 'awaiting_upload' THEN
        RETURN;
      END IF;

      UPDATE gallery_photos
      SET actual_raw_bytes = COALESCE(actual_raw_bytes, p_actual_raw_bytes),
          uploaded_at = COALESCE(uploaded_at, p_uploaded_at),
          updated_at = now()
      WHERE id = p_photo_id;
    END;
    $FN$
  `;

  await sql`DROP FUNCTION IF EXISTS claim_gallery_photo_processing`;
  await sql`
    CREATE OR REPLACE FUNCTION claim_gallery_photo_processing(
      p_photo_id uuid,
      p_generation integer
    ) RETURNS TABLE (claimed boolean, attempt integer) LANGUAGE plpgsql AS $FN$
    DECLARE
      v_photo gallery_photos%ROWTYPE;
      v_attempt integer;
    BEGIN
      SELECT * INTO v_photo FROM gallery_photos WHERE id = p_photo_id FOR UPDATE;
      IF NOT FOUND OR v_photo.processing_generation <> p_generation OR v_photo.status <> 'awaiting_upload' THEN
        RETURN QUERY SELECT false, 0;
        RETURN;
      END IF;

      v_attempt := v_photo.attempts + 1;
      UPDATE gallery_photos
      SET status = 'processing', attempts = v_attempt, processing_lease_at = now(), updated_at = now()
      WHERE id = p_photo_id;

      RETURN QUERY SELECT true, v_attempt;
    END;
    $FN$
  `;

  await sql`DROP FUNCTION IF EXISTS complete_gallery_photo`;
  await sql`
    CREATE OR REPLACE FUNCTION complete_gallery_photo(
      p_photo_id uuid,
      p_generation integer,
      p_raw_bytes bigint,
      p_display_bytes bigint,
      p_thumbnail_bytes bigint,
      p_width integer,
      p_height integer
    ) RETURNS void LANGUAGE plpgsql AS $FN$
    DECLARE
      v_photo gallery_photos%ROWTYPE;
      v_final_bytes bigint;
    BEGIN
      SELECT * INTO v_photo FROM gallery_photos WHERE id = p_photo_id FOR UPDATE;
      IF NOT FOUND OR v_photo.processing_generation <> p_generation OR v_photo.status <> 'processing' THEN
        RETURN;
      END IF;

      v_final_bytes := p_raw_bytes + p_display_bytes + p_thumbnail_bytes;

      UPDATE gallery_photos
      SET status = 'ready',
          actual_raw_bytes = p_raw_bytes,
          display_bytes = p_display_bytes,
          thumbnail_bytes = p_thumbnail_bytes,
          width = p_width,
          height = p_height,
          reserved_bytes = 0,
          processing_lease_at = NULL,
          published_at = now(),
          updated_at = now()
      WHERE id = p_photo_id;

      UPDATE gallery_storage_state
      SET used_bytes = used_bytes + v_final_bytes,
          reserved_bytes = GREATEST(reserved_bytes - v_photo.reserved_bytes, 0),
          updated_at = now()
      WHERE id = 1;
    END;
    $FN$
  `;

  await sql`DROP FUNCTION IF EXISTS reject_gallery_photo`;
  await sql`
    CREATE OR REPLACE FUNCTION reject_gallery_photo(
      p_photo_id uuid,
      p_generation integer,
      p_reason text
    ) RETURNS void LANGUAGE plpgsql AS $FN$
    DECLARE
      v_photo gallery_photos%ROWTYPE;
    BEGIN
      SELECT * INTO v_photo FROM gallery_photos WHERE id = p_photo_id FOR UPDATE;
      IF NOT FOUND OR v_photo.processing_generation <> p_generation OR v_photo.status NOT IN ('awaiting_upload', 'processing') THEN
        RETURN;
      END IF;

      UPDATE gallery_photos
      SET status = 'rejected',
          failure_code = p_reason,
          reserved_bytes = 0,
          processing_lease_at = NULL,
          updated_at = now()
      WHERE id = p_photo_id;

      UPDATE gallery_storage_state
      SET reserved_bytes = GREATEST(reserved_bytes - v_photo.reserved_bytes, 0),
          updated_at = now()
      WHERE id = 1;

      IF v_photo.browser_id IS NOT NULL THEN
        UPDATE gallery_browsers
        SET raw_bytes = GREATEST(raw_bytes - v_photo.declared_raw_bytes, 0), updated_at = now()
        WHERE id = v_photo.browser_id;
      END IF;
    END;
    $FN$
  `;

  await sql`DROP FUNCTION IF EXISTS fail_gallery_photo`;
  await sql`
    CREATE OR REPLACE FUNCTION fail_gallery_photo(
      p_photo_id uuid,
      p_generation integer,
      p_reason text
    ) RETURNS void LANGUAGE plpgsql AS $FN$
    DECLARE
      v_photo gallery_photos%ROWTYPE;
    BEGIN
      SELECT * INTO v_photo FROM gallery_photos WHERE id = p_photo_id FOR UPDATE;
      IF NOT FOUND OR v_photo.processing_generation <> p_generation OR v_photo.status <> 'processing' THEN
        RETURN;
      END IF;

      UPDATE gallery_photos
      SET status = 'failed',
          failure_code = p_reason,
          processing_lease_at = NULL,
          updated_at = now()
      WHERE id = p_photo_id;
    END;
    $FN$
  `;

  await sql`DROP FUNCTION IF EXISTS release_gallery_photo`;
  await sql`
    CREATE OR REPLACE FUNCTION release_gallery_photo(
      p_photo_id uuid,
      p_generation integer
    ) RETURNS void LANGUAGE plpgsql AS $FN$
    DECLARE
      v_photo gallery_photos%ROWTYPE;
    BEGIN
      SELECT * INTO v_photo FROM gallery_photos WHERE id = p_photo_id FOR UPDATE;
      IF NOT FOUND OR v_photo.processing_generation <> p_generation OR v_photo.status NOT IN ('awaiting_upload', 'processing') THEN
        RETURN;
      END IF;

      DELETE FROM gallery_photos WHERE id = p_photo_id;

      UPDATE gallery_storage_state
      SET reserved_bytes = GREATEST(reserved_bytes - v_photo.reserved_bytes, 0),
          updated_at = now()
      WHERE id = 1;

      IF v_photo.browser_id IS NOT NULL THEN
        UPDATE gallery_browsers
        SET raw_bytes = GREATEST(raw_bytes - v_photo.declared_raw_bytes, 0), updated_at = now()
        WHERE id = v_photo.browser_id;
      END IF;
    END;
    $FN$
  `;

  console.log('Migration complete');
}

migrate().catch((err) => { console.error(err); process.exit(1); });
