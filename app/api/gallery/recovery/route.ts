import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../../src/lib/db';
import { getGalleryRecoveryConfig } from '../../../../src/lib/galleryConfig';
import { deleteGalleryBlobs, galleryOriginalPath, headGalleryBlob } from '../../../../src/lib/galleryStorage';
import { enqueueGalleryPhoto } from '../../../../src/lib/galleryQueue';

export const dynamic = 'force-dynamic';

const RUN_ROW_BUDGET = 100;
const RECOVERY_CLAIM_STALE_MINUTES = 15;
const PROCESSING_LEASE_STALE_MINUTES = 15;

function hasValidCronSecret(request: NextRequest, cronSecret: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${cronSecret}`;
  const provided = Buffer.from(header);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length) return false;
  return timingSafeEqual(provided, expectedBuffer);
}

// Publishes to the processing queue; on failure, clears the recovery claim so a
// later run retries the publish instead of leaving the row silently stuck.
async function enqueueWithRecoveryFallback(photoId: string, generation: number): Promise<'enqueued' | 'publish_failed'> {
  try {
    await enqueueGalleryPhoto(photoId, generation);
    return 'enqueued';
  } catch (error) {
    console.error('gallery recovery: queue publish failed, clearing claim for retry', error);
    await sql`
      UPDATE gallery_photos SET recovery_enqueued_at = NULL, updated_at = now()
      WHERE id = ${photoId}::uuid AND processing_generation = ${generation}::integer
    `;
    return 'publish_failed';
  }
}

export async function GET(request: NextRequest) {
  let cronSecret: string;
  try {
    ({ cronSecret } = getGalleryRecoveryConfig());
  } catch {
    return NextResponse.json({ error: 'Gallery recovery is not configured' }, { status: 503 });
  }
  if (!hasValidCronSecret(request, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary = { enqueuedUploaded: 0, recordedThenEnqueued: 0, rejectedSizeMismatch: 0, released: 0, resetStaleLeases: 0, publishFailures: 0 };
  let remaining = RUN_ROW_BUDGET;

  // Category 1: uploaded originals waiting to be (re-)claimed for processing.
  if (remaining > 0) {
    const claimed = await sql`
      UPDATE gallery_photos
      SET recovery_enqueued_at = now(), updated_at = now()
      WHERE id IN (
        SELECT id FROM gallery_photos
        WHERE status = 'awaiting_upload' AND uploaded_at IS NOT NULL
          AND (recovery_enqueued_at IS NULL OR recovery_enqueued_at < now() - ${RECOVERY_CLAIM_STALE_MINUTES}::integer * interval '1 minute')
        ORDER BY recovery_enqueued_at NULLS FIRST, uploaded_at
        LIMIT ${remaining}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, processing_generation
    `;
    remaining -= claimed.length;
    for (const row of claimed) {
      const outcome = await enqueueWithRecoveryFallback(row.id as string, row.processing_generation as number);
      if (outcome === 'enqueued') summary.enqueuedUploaded += 1;
      else summary.publishFailures += 1;
    }
  }

  // Category 2: reservations past their 24h upload deadline with no recorded upload.
  if (remaining > 0) {
    const expired = await sql`
      SELECT id, processing_generation, original_filename, declared_raw_bytes
      FROM gallery_photos
      WHERE status = 'awaiting_upload' AND uploaded_at IS NULL AND upload_expires_at < now()
      ORDER BY upload_expires_at
      LIMIT ${remaining}
    `;
    remaining -= expired.length;
    for (const row of expired) {
      const photoId = row.id as string;
      const generation = row.processing_generation as number;
      const pathname = galleryOriginalPath(photoId, row.original_filename as string);
      const head = await headGalleryBlob(pathname);

      if (!head) {
        await sql`SELECT release_gallery_photo(${photoId}::uuid, ${generation}::integer)`;
        summary.released += 1;
        continue;
      }

      if (head.size !== Number(row.declared_raw_bytes)) {
        await deleteGalleryBlobs([pathname]);
        await sql`SELECT reject_gallery_photo(${photoId}::uuid, ${generation}::integer, 'size_mismatch')`;
        summary.rejectedSizeMismatch += 1;
        continue;
      }

      await sql`SELECT record_gallery_upload(${photoId}::uuid, ${generation}::integer, ${head.size}::bigint, ${head.uploadedAt.toISOString()}::timestamptz)`;
      await sql`
        UPDATE gallery_photos SET recovery_enqueued_at = now(), updated_at = now()
        WHERE id = ${photoId}::uuid AND processing_generation = ${generation}::integer
      `;
      const outcome = await enqueueWithRecoveryFallback(photoId, generation);
      if (outcome === 'enqueued') summary.recordedThenEnqueued += 1;
      else summary.publishFailures += 1;
    }
  }

  // Category 3: processing leases abandoned by a crashed/timed-out invocation.
  if (remaining > 0) {
    const staleLeases = await sql`
      UPDATE gallery_photos
      SET status = 'awaiting_upload', processing_lease_at = NULL, recovery_enqueued_at = now(), updated_at = now()
      WHERE id IN (
        SELECT id FROM gallery_photos
        WHERE status = 'processing' AND processing_lease_at < now() - ${PROCESSING_LEASE_STALE_MINUTES}::integer * interval '1 minute'
        ORDER BY processing_lease_at
        LIMIT ${remaining}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, processing_generation
    `;
    for (const row of staleLeases) {
      summary.resetStaleLeases += 1;
      const outcome = await enqueueWithRecoveryFallback(row.id as string, row.processing_generation as number);
      if (outcome !== 'enqueued') summary.publishFailures += 1;
    }
  }

  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
