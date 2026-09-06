import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { issueSignedToken } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '../../../../../src/lib/adminAuth';
import { sql } from '../../../../../src/lib/db';
import { gallerySessionFromRequest } from '../../../../../src/lib/galleryAuth';
import { getGalleryStorageConfig, UPLOAD_URL_TTL_SECONDS } from '../../../../../src/lib/galleryConfig';
import { enqueueGalleryPhoto } from '../../../../../src/lib/galleryQueue';
import { deleteGalleryBlobs, galleryOriginalPath, headGalleryBlob } from '../../../../../src/lib/galleryStorage';
import { checkRateLimit } from '../../../../../src/lib/rateLimit';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class GallerySignedTokenRequestError extends Error {}

type GalleryUploadTokenPayload = { photoId: string; generation: number };

function parseGalleryUploadTokenPayload(raw: string | null): GalleryUploadTokenPayload | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { photoId, generation } = parsed as Record<string, unknown>;
  if (typeof photoId !== 'string' || !UUID_PATTERN.test(photoId)) return null;
  if (typeof generation !== 'number' || !Number.isInteger(generation) || generation <= 0) return null;
  return { photoId, generation };
}

export async function POST(request: NextRequest) {
  let body: HandleUploadPresignedBody;
  try {
    body = (await request.json()) as HandleUploadPresignedBody;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  let webhookPublicKey: string;
  try {
    ({ blobWebhookPublicKey: webhookPublicKey } = getGalleryStorageConfig());
  } catch {
    return NextResponse.json({ error: 'Gallery storage is not configured' }, { status: 503 });
  }

  try {
    const result = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey,

      // Client-facing: issues the presigned PUT token before the browser uploads.
      // Runs with the original request's cookies, so the full auth chain applies.
      getSignedToken: async (pathname, clientPayload) => {
        const session = gallerySessionFromRequest(request);
        if (!session) throw new GallerySignedTokenRequestError('Unauthorized');
        if (!isSameOriginRequest(request)) throw new GallerySignedTokenRequestError('Unauthorized');

        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const ipAllowed = await checkRateLimit(`gallery:uploads:blob:ip:${ip}`, { limit: 300, windowSeconds: 60 });
        const browserAllowed = await checkRateLimit(`gallery:uploads:blob:browser:${session.browserId}`, { limit: 300, windowSeconds: 60 });
        if (!ipAllowed || !browserAllowed) throw new GallerySignedTokenRequestError('Too many requests');

        const payload = parseGalleryUploadTokenPayload(clientPayload);
        if (!payload) throw new GallerySignedTokenRequestError('Malformed upload token payload');

        const rows = await sql`
          SELECT original_filename, declared_raw_bytes
          FROM gallery_photos
          WHERE id = ${payload.photoId}::uuid
            AND processing_generation = ${payload.generation}::integer
            AND status = 'awaiting_upload'
            AND browser_id = ${session.browserId}::uuid
            AND upload_expires_at > now()
        `;
        const photo = rows[0] as { original_filename: string; declared_raw_bytes: string } | undefined;
        if (!photo) throw new GallerySignedTokenRequestError('No matching unexpired reservation for this browser');

        const expectedPathname = galleryOriginalPath(payload.photoId, photo.original_filename);
        if (pathname !== expectedPathname) throw new GallerySignedTokenRequestError('Pathname does not match the reservation');

        const validUntil = Date.now() + UPLOAD_URL_TTL_SECONDS * 1000;
        return {
          token: await issueSignedToken({
            pathname,
            operations: ['put'],
            validUntil,
            allowedContentTypes: ['image/jpeg'],
            maximumSizeInBytes: Number(photo.declared_raw_bytes),
          }),
          urlOptions: {
            validUntil,
            addRandomSuffix: false,
            allowOverwrite: true,
            cacheControlMaxAge: 60,
            tokenPayload: JSON.stringify(payload),
          },
        };
      },

      // Webhook-facing: Vercel calls this after the browser's PUT completes. No
      // browser cookie is present here — `handleUploadPresigned` already verified
      // the Ed25519 `x-vercel-signature` against `BLOB_WEBHOOK_PUBLIC_KEY` before
      // invoking this callback, which is the entire trust boundary for this path.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseGalleryUploadTokenPayload(tokenPayload ?? null);
        if (!payload) return; // nothing we can safely reconcile

        const rows = await sql`
          SELECT status, processing_generation, original_filename, declared_raw_bytes
          FROM gallery_photos WHERE id = ${payload.photoId}::uuid
        `;
        const photo = rows[0] as
          | { status: string; processing_generation: number; original_filename: string; declared_raw_bytes: string }
          | undefined;
        if (!photo) return; // unknown id
        if (Number(photo.processing_generation) !== payload.generation) return; // stale generation
        if (photo.status !== 'awaiting_upload') return; // duplicate callback after ready/rejected/processing: no-op

        const expectedPathname = galleryOriginalPath(payload.photoId, photo.original_filename);
        if (blob.pathname !== expectedPathname) return;

        const head = await headGalleryBlob(expectedPathname);
        if (!head) {
          throw new Error('gallery upload-completed callback fired but the blob is not readable yet');
        }

        if (head.size !== Number(photo.declared_raw_bytes)) {
          await deleteGalleryBlobs([expectedPathname]);
          await sql`SELECT reject_gallery_photo(${payload.photoId}::uuid, ${payload.generation}::integer, 'size_mismatch')`;
          return;
        }

        await sql`
          SELECT record_gallery_upload(${payload.photoId}::uuid, ${payload.generation}::integer, ${head.size}::bigint, ${head.uploadedAt.toISOString()}::timestamptz)
        `;
        await enqueueGalleryPhoto(payload.photoId, payload.generation);
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GallerySignedTokenRequestError) {
      const status = error.message === 'Unauthorized' ? 401 : error.message === 'Too many requests' ? 429 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    // Indeterminate failure (head/DB/queue). Non-2xx makes Vercel retry the
    // upload-completed callback (up to five times); the hourly recovery route
    // is the backstop if every retry is lost.
    console.error('gallery upload blob route failed', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
