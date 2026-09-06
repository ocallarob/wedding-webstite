import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '../../../../src/lib/adminAuth';
import { sql } from '../../../../src/lib/db';
import { gallerySessionFromRequest } from '../../../../src/lib/galleryAuth';
import { DISPLAY_RESERVED_BYTES, THUMBNAIL_RESERVED_BYTES } from '../../../../src/lib/galleryConfig';
import { reserveGalleryPhoto } from '../../../../src/lib/galleryReservation';
import { galleryOriginalPath } from '../../../../src/lib/galleryStorage';
import { validateGalleryUploadIntent } from '../../../../src/lib/galleryValidation';
import { checkRateLimit } from '../../../../src/lib/rateLimit';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STATUS_IDS = 100;

export async function POST(request: NextRequest) {
  const session = gallerySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipAllowed = await checkRateLimit(`gallery:uploads:post:ip:${ip}`, { limit: 300, windowSeconds: 60 });
  const browserAllowed = await checkRateLimit(`gallery:uploads:post:browser:${session.browserId}`, { limit: 300, windowSeconds: 60 });
  if (!ipAllowed || !browserAllowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const validation = validateGalleryUploadIntent(body);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  const { intent } = validation;

  const result = await reserveGalleryPhoto({
    photoId: randomUUID(),
    browserId: session.browserId,
    source: 'guest',
    uploaderName: intent.uploaderName,
    originalFilename: intent.originalFilename,
    sha256: intent.sha256,
    rawBytes: intent.rawBytes,
    reservedBytes: intent.rawBytes + DISPLAY_RESERVED_BYTES + THUMBNAIL_RESERVED_BYTES,
  });

  switch (result.outcome) {
    case 'duplicate':
      return NextResponse.json({ error: 'This photo has already been uploaded' }, { status: 409 });
    case 'browser_quota':
      return NextResponse.json({ error: 'This browser has reached its 500 MiB upload quota' }, { status: 413 });
    case 'storage_quota':
      return NextResponse.json({ error: 'The gallery has reached its storage limit' }, { status: 507 });
  }

  return NextResponse.json(
    {
      photoId: result.photoId,
      pathname: galleryOriginalPath(result.photoId, result.originalFilename),
      generation: result.generation,
      expiresAt: result.expiresAt,
      remainingBrowserBytes: result.remainingBrowserBytes,
    },
    { status: 201 },
  );
}

export async function GET(request: NextRequest) {
  const session = gallerySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipAllowed = await checkRateLimit(`gallery:uploads:get:ip:${ip}`, { limit: 120, windowSeconds: 60 });
  const browserAllowed = await checkRateLimit(`gallery:uploads:get:browser:${session.browserId}`, { limit: 120, windowSeconds: 60 });
  if (!ipAllowed || !browserAllowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const ids = (request.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0 || ids.length > MAX_STATUS_IDS || ids.some((id) => !UUID_PATTERN.test(id))) {
    return NextResponse.json({ error: `"ids" must be 1-${MAX_STATUS_IDS} comma-separated UUIDs` }, { status: 400 });
  }

  const rows = await sql`
    SELECT id, status, failure_code
    FROM gallery_photos
    WHERE id = ANY(${ids}::uuid[]) AND browser_id = ${session.browserId}::uuid
  `;

  const uploads = rows.map((row) => ({
    photoId: row.id as string,
    status: row.status as string,
    failureReason: (row.failure_code as string | null) ?? null,
  }));

  return NextResponse.json({ uploads }, { headers: { 'Cache-Control': 'no-store' } });
}
