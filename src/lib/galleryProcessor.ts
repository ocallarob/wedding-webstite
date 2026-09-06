import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { sql } from './db';
import { DISPLAY_RESERVED_BYTES, THUMBNAIL_RESERVED_BYTES } from './galleryConfig';
import {
  deleteGalleryBlobs,
  galleryDisplayPath,
  galleryOriginalPath,
  galleryThumbnailPath,
  putGalleryBlob,
  readGalleryBlob,
} from './galleryStorage';

const PIXEL_LIMIT = 100_000_000;
const DISPLAY_LONG_EDGE = 2048;
const THUMBNAIL_LONG_EDGE = 512;
const DISPLAY_QUALITY = 82;
const THUMBNAIL_QUALITY = 72;
const DISPLAY_QUALITY_RETRY = 80;
const THUMBNAIL_QUALITY_RETRY = 60;
const MAX_TRANSIENT_ATTEMPTS = 5;
const DERIVATIVE_CACHE_MAX_AGE_SECONDS = 60;

export class GalleryInvalidJpegError extends Error {}
export class GalleryPixelLimitError extends Error {}
export class GalleryDerivativeTooLargeError extends Error {}

export class GalleryProcessingBusyError extends Error {
  constructor(photoId: string, generation: number) {
    super(`gallery photo ${photoId} generation ${generation} is already being processed`);
  }
}

function isPixelLimitError(error: unknown): boolean {
  return error instanceof Error && /exceeds pixel limit/i.test(error.message);
}

async function renderJpegVariant(
  input: Buffer,
  longEdge: number,
  quality: number,
): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input, { limitInputPixels: PIXEL_LIMIT })
    .rotate()
    .resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Decodes a JPEG and renders the two publishable derivatives. Never calls
 * `withMetadata()`, so neither output carries EXIF/GPS. Pure and side-effect
 * free: callers own writing the results and updating the database.
 */
export async function buildDerivatives(input: Buffer): Promise<{
  display: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
}> {
  let format: string | undefined;
  try {
    ({ format } = await sharp(input, { limitInputPixels: PIXEL_LIMIT }).rotate().metadata());
  } catch (error) {
    if (isPixelLimitError(error)) throw new GalleryPixelLimitError('decoded image exceeds the pixel limit');
    throw new GalleryInvalidJpegError('unable to decode image');
  }
  if (format !== 'jpeg') {
    throw new GalleryInvalidJpegError(`unexpected image format: ${format}`);
  }

  let display = await renderJpegVariant(input, DISPLAY_LONG_EDGE, DISPLAY_QUALITY);
  if (display.data.byteLength > DISPLAY_RESERVED_BYTES) {
    display = await renderJpegVariant(input, DISPLAY_LONG_EDGE, DISPLAY_QUALITY_RETRY);
    if (display.data.byteLength > DISPLAY_RESERVED_BYTES) {
      throw new GalleryDerivativeTooLargeError('display derivative exceeds its reserved size after retry');
    }
  }

  let thumbnail = await renderJpegVariant(input, THUMBNAIL_LONG_EDGE, THUMBNAIL_QUALITY);
  if (thumbnail.data.byteLength > THUMBNAIL_RESERVED_BYTES) {
    thumbnail = await renderJpegVariant(input, THUMBNAIL_LONG_EDGE, THUMBNAIL_QUALITY_RETRY);
    if (thumbnail.data.byteLength > THUMBNAIL_RESERVED_BYTES) {
      throw new GalleryDerivativeTooLargeError('thumbnail derivative exceeds its reserved size after retry');
    }
  }

  return { display: display.data, thumbnail: thumbnail.data, width: display.width, height: display.height };
}

type GalleryPhotoRow = {
  status: string;
  processing_generation: number;
  original_filename: string;
  content_sha256: string;
  declared_raw_bytes: string;
};

/**
 * Claims, decodes, and publishes one reserved gallery photo. Idempotent and
 * generation-aware so redelivered queue messages, recovery re-enqueues, and
 * import-CLI direct calls can never double-process or double-charge quota.
 */
export async function processGalleryPhoto(photoId: string, generation: number, input?: Buffer): Promise<void> {
  const photoRows = await sql`
    SELECT status, processing_generation, original_filename, content_sha256, declared_raw_bytes
    FROM gallery_photos WHERE id = ${photoId}::uuid
  `;
  const photo = photoRows[0] as GalleryPhotoRow | undefined;

  if (!photo || Number(photo.processing_generation) !== generation) return; // stale message
  if (photo.status === 'ready' || photo.status === 'rejected' || photo.status === 'failed') return; // terminal already
  if (photo.status === 'processing') throw new GalleryProcessingBusyError(photoId, generation);

  const claimRows = await sql`SELECT claimed, attempt FROM claim_gallery_photo_processing(${photoId}::uuid, ${generation}::integer)`;
  const claim = claimRows[0] as { claimed: boolean; attempt: number } | undefined;
  if (!claim?.claimed) throw new GalleryProcessingBusyError(photoId, generation); // lost the race to claim

  const originalPath = galleryOriginalPath(photoId, photo.original_filename);
  const displayPath = galleryDisplayPath(photoId, photo.original_filename);
  const thumbnailPath = galleryThumbnailPath(photoId, photo.original_filename);

  try {
    const bytes = input ?? (await readGalleryBlob(originalPath));

    if (bytes.byteLength !== Number(photo.declared_raw_bytes)) {
      await deleteGalleryBlobs([originalPath]);
      await sql`SELECT reject_gallery_photo(${photoId}::uuid, ${generation}::integer, 'size_mismatch')`;
      return;
    }
    if (createHash('sha256').update(bytes).digest('hex') !== photo.content_sha256) {
      await deleteGalleryBlobs([originalPath]);
      await sql`SELECT reject_gallery_photo(${photoId}::uuid, ${generation}::integer, 'hash_mismatch')`;
      return;
    }

    const derivatives = await buildDerivatives(bytes);

    await putGalleryBlob(displayPath, derivatives.display, {
      contentType: 'image/jpeg',
      cacheControlMaxAge: DERIVATIVE_CACHE_MAX_AGE_SECONDS,
    });
    await putGalleryBlob(thumbnailPath, derivatives.thumbnail, {
      contentType: 'image/jpeg',
      cacheControlMaxAge: DERIVATIVE_CACHE_MAX_AGE_SECONDS,
    });

    await sql`
      SELECT complete_gallery_photo(
        ${photoId}::uuid, ${generation}::integer,
        ${bytes.byteLength}::bigint, ${derivatives.display.byteLength}::bigint, ${derivatives.thumbnail.byteLength}::bigint,
        ${derivatives.width}::integer, ${derivatives.height}::integer
      )
    `;
  } catch (error) {
    if (error instanceof GalleryInvalidJpegError || error instanceof GalleryPixelLimitError) {
      await deleteGalleryBlobs([originalPath, displayPath, thumbnailPath]);
      const code = error instanceof GalleryPixelLimitError ? 'pixel_limit' : 'invalid_jpeg';
      await sql`SELECT reject_gallery_photo(${photoId}::uuid, ${generation}::integer, ${code})`;
      return;
    }

    if (error instanceof GalleryDerivativeTooLargeError) {
      // Deterministic property of this image: retrying more attempts would never help.
      await deleteGalleryBlobs([displayPath, thumbnailPath]);
      await sql`SELECT fail_gallery_photo(${photoId}::uuid, ${generation}::integer, 'derivative_too_large')`;
      return;
    }

    // Unexpected/transient failure (network blip, Blob write hiccup, ...). Re-check
    // ground truth before rolling back: the write/complete may have actually landed.
    const currentRows = await sql`SELECT status FROM gallery_photos WHERE id = ${photoId}::uuid AND processing_generation = ${generation}::integer`;
    const currentStatus = (currentRows[0] as { status: string } | undefined)?.status;
    if (currentStatus === 'ready') return; // completion already committed; keep both derivatives.

    await deleteGalleryBlobs([displayPath, thumbnailPath]);

    if (claim.attempt >= MAX_TRANSIENT_ATTEMPTS) {
      // Terminal: call fail_gallery_photo while status is still 'processing' so its
      // generation/status guard matches; it moves the row to 'failed' itself.
      await sql`SELECT fail_gallery_photo(${photoId}::uuid, ${generation}::integer, 'processing_failed')`;
      return;
    }

    // Single-row compare-and-set: safe without a stored function (no storage/browser
    // counters involved), and lets a fresh queue message re-claim this generation.
    await sql`
      UPDATE gallery_photos
      SET status = 'awaiting_upload', processing_lease_at = NULL, updated_at = now()
      WHERE id = ${photoId}::uuid AND processing_generation = ${generation}::integer AND status = 'processing'
    `;
    throw error; // let the queue redeliver
  }
}
