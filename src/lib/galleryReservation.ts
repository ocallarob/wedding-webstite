import { Resend } from 'resend';
import { sql } from './db';
import { BROWSER_RAW_LIMIT_BYTES, getGalleryConfig } from './galleryConfig';

export type GalleryReservationSource = 'guest' | 'table_cameras';

export type GalleryReservationInput = {
  photoId: string;
  browserId: string | null;
  source: GalleryReservationSource;
  uploaderName: string;
  originalFilename: string;
  sha256: string;
  rawBytes: number;
  reservedBytes: number;
};

export type GalleryReservationResult =
  | {
      outcome: 'reserved' | 'retry';
      photoId: string;
      generation: number;
      expiresAt: string;
      remainingBrowserBytes: number | null;
      // The persisted filename — may differ from the caller's submitted
      // `originalFilename` on a retry of a previously failed row, which keeps
      // its first-attempt filename/pathname rather than stranding the
      // retained original blob under a renamed, unaccounted-for path.
      originalFilename: string;
    }
  | { outcome: 'duplicate' | 'browser_quota' | 'storage_quota' };

/**
 * Shared reservation path for both the guest upload API and the table-camera
 * import CLI: calls the atomic `reserve_gallery_photo` database function and,
 * when it reports a storage-warning claim, attempts the operator alert email.
 */
export async function reserveGalleryPhoto(input: GalleryReservationInput): Promise<GalleryReservationResult> {
  const config = getGalleryConfig();

  const rows = await sql`
    SELECT * FROM reserve_gallery_photo(
      ${input.photoId}::uuid,
      ${input.browserId}::uuid,
      ${input.source},
      ${input.uploaderName},
      ${input.originalFilename},
      ${input.sha256},
      ${input.rawBytes}::bigint,
      ${input.reservedBytes}::bigint,
      ${BROWSER_RAW_LIMIT_BYTES}::bigint,
      ${config.storageWarningBytes}::bigint,
      ${config.storageLimitBytes}::bigint
    )
  `;

  const row = rows[0] as {
    outcome: string;
    photo_id: string | null;
    processing_generation: number | null;
    alert_claimed: boolean;
    reservation_expires_at: string | null;
  };

  if (row.alert_claimed) {
    await sendGalleryStorageWarningEmail(config.alertEmail, config.storageWarningBytes);
  }

  if (row.outcome !== 'reserved' && row.outcome !== 'retry') {
    return { outcome: row.outcome as 'duplicate' | 'browser_quota' | 'storage_quota' };
  }

  let remainingBrowserBytes: number | null = null;
  if (input.browserId) {
    const browserRows = await sql`SELECT raw_bytes FROM gallery_browsers WHERE id = ${input.browserId}::uuid`;
    const rawBytes = Number(browserRows[0]?.raw_bytes ?? 0);
    remainingBrowserBytes = Math.max(BROWSER_RAW_LIMIT_BYTES - rawBytes, 0);
  }

  const filenameRows = await sql`SELECT original_filename FROM gallery_photos WHERE id = ${row.photo_id}::uuid`;
  const originalFilename = String(filenameRows[0]?.original_filename ?? input.originalFilename);


  return {
    outcome: row.outcome as 'reserved' | 'retry',
    photoId: row.photo_id as string,
    generation: row.processing_generation as number,
    expiresAt: new Date(row.reservation_expires_at as string).toISOString(),
    remainingBrowserBytes,
    originalFilename,
  };
}

async function clearGalleryStorageWarningClaim(thresholdBytes: number): Promise<void> {
  try {
    await sql`
      UPDATE gallery_storage_state
      SET warning_claimed_at = NULL, warning_threshold_bytes = NULL, updated_at = now()
      WHERE id = 1 AND warning_threshold_bytes = ${thresholdBytes}::bigint AND warning_sent_at IS NULL
    `;
  } catch {
    // The reservation itself already succeeded; a later threshold change can
    // still recover an alert if this best-effort cleanup cannot run.
  }
}

async function sendGalleryStorageWarningEmail(alertEmail: string, thresholdBytes: number): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    await clearGalleryStorageWarningClaim(thresholdBytes);
    return;
  }

  const thresholdGiB = (thresholdBytes / 1024 ** 3).toFixed(1);
  let messageId: string;
  try {
    const result = await new Resend(apiKey).emails.send(
      {
        from: 'Alannah & Rob <hello@alannah-rob.ie>',
        to: alertEmail,
        subject: `Gallery storage warning: ${thresholdGiB} GiB reached`,
        html: `<p>The wedding gallery has used or reserved at least ${thresholdGiB} GiB of its configured storage allowance. Check <code>/dashboard/gallery</code> for current usage.</p>`,
      },
      // Deterministic per threshold: a retried call for the same still-unresolved
      // threshold can never cause Resend to deliver a second copy.
      { idempotencyKey: `gallery-storage-warning/${thresholdBytes}` },
    );
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message ?? 'Resend did not return a message id');
    }
    messageId = result.data.id;
  } catch {
    // The provider itself rejected/failed the send: no email went out, so it
    // is safe to release the claim for a later reservation to retry.
    await clearGalleryStorageWarningClaim(thresholdBytes);
    return;
  }

  // Resend accepted the send (an id came back). Never clear the claim past
  // this point: a DB hiccup here must not cause a duplicate send. The
  // idempotency key above is the backstop if this branch is ever retried.
  try {
    await sql`
      UPDATE gallery_storage_state
      SET warning_sent_at = now(), updated_at = now()
      WHERE id = 1 AND warning_threshold_bytes = ${thresholdBytes}::bigint AND warning_sent_at IS NULL
    `;
  } catch (error) {
    console.error(`gallery storage warning: Resend accepted ${messageId} but recording warning_sent_at failed`, error);
  }
}
