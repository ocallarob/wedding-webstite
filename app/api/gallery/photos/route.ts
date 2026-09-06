import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../../src/lib/db';
import { gallerySessionFromRequest } from '../../../../src/lib/galleryAuth';
import { GALLERY_PAGE_SIZE } from '../../../../src/lib/galleryConfig';
import {
  decodeGalleryCursor,
  encodeGalleryCursor,
  type GalleryDirection,
  type GallerySort,
} from '../../../../src/lib/galleryValidation';
import { checkRateLimit } from '../../../../src/lib/rateLimit';

export const dynamic = 'force-dynamic';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

type PhotoRow = {
  id: string;
  original_filename: string;
  uploader_name: string;
  uploaded_at: string;
  width: number | null;
  height: number | null;
  filename_sort: string;
};

// One static query per (sort, direction) pair. Cursor presence is folded into a
// boolean OR rather than a fifth query variant per pair: when `hasCursor` is
// false the tuple comparison is bypassed entirely and the sentinel values are
// never evaluated for correctness, only for valid typing.
async function fetchGalleryPhotosPage(
  sort: GallerySort,
  direction: GalleryDirection,
  hasCursor: boolean,
  cursorValue: string,
  cursorId: string,
): Promise<PhotoRow[]> {
  if (sort === 'filename' && direction === 'asc') {
    return (await sql`
      SELECT id, original_filename, uploader_name, uploaded_at, width, height, lower(original_filename) AS filename_sort
      FROM gallery_photos
      WHERE status = 'ready'
        AND (${hasCursor}::boolean = false OR (lower(original_filename), id) > (${cursorValue}, ${cursorId}::uuid))
      ORDER BY lower(original_filename) ASC, id ASC
      LIMIT ${GALLERY_PAGE_SIZE}
    `) as PhotoRow[];
  }
  if (sort === 'filename' && direction === 'desc') {
    return (await sql`
      SELECT id, original_filename, uploader_name, uploaded_at, width, height, lower(original_filename) AS filename_sort
      FROM gallery_photos
      WHERE status = 'ready'
        AND (${hasCursor}::boolean = false OR (lower(original_filename), id) < (${cursorValue}, ${cursorId}::uuid))
      ORDER BY lower(original_filename) DESC, id DESC
      LIMIT ${GALLERY_PAGE_SIZE}
    `) as PhotoRow[];
  }
  if (sort === 'uploaded' && direction === 'asc') {
    return (await sql`
      SELECT id, original_filename, uploader_name, uploaded_at, width, height, lower(original_filename) AS filename_sort
      FROM gallery_photos
      WHERE status = 'ready'
        AND (${hasCursor}::boolean = false OR (uploaded_at, id) > (${cursorValue}::timestamptz, ${cursorId}::uuid))
      ORDER BY uploaded_at ASC, id ASC
      LIMIT ${GALLERY_PAGE_SIZE}
    `) as PhotoRow[];
  }
  return (await sql`
    SELECT id, original_filename, uploader_name, uploaded_at, width, height, lower(original_filename) AS filename_sort
    FROM gallery_photos
    WHERE status = 'ready'
      AND (${hasCursor}::boolean = false OR (uploaded_at, id) < (${cursorValue}::timestamptz, ${cursorId}::uuid))
    ORDER BY uploaded_at DESC, id DESC
    LIMIT ${GALLERY_PAGE_SIZE}
  `) as PhotoRow[];
}

export async function GET(request: NextRequest) {
  const session = gallerySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipAllowed = await checkRateLimit(`gallery:photos:ip:${ip}`, { limit: 120, windowSeconds: 60 });
  const browserAllowed = await checkRateLimit(`gallery:photos:browser:${session.browserId}`, { limit: 120, windowSeconds: 60 });
  if (!ipAllowed || !browserAllowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const params = request.nextUrl.searchParams;

  const sortParam = params.get('sort');
  if (sortParam !== null && sortParam !== 'filename' && sortParam !== 'uploaded') {
    return NextResponse.json({ error: '"sort" must be filename or uploaded' }, { status: 400 });
  }
  const sort: GallerySort = sortParam === 'uploaded' ? 'uploaded' : 'filename';

  const directionParam = params.get('direction');
  if (directionParam !== null && directionParam !== 'asc' && directionParam !== 'desc') {
    return NextResponse.json({ error: '"direction" must be asc or desc' }, { status: 400 });
  }
  const direction: GalleryDirection = directionParam === 'desc' ? 'desc' : 'asc';

  const cursorParam = params.get('cursor');
  let cursorValue = sort === 'uploaded' ? EPOCH_ISO : '';
  let cursorId = NIL_UUID;
  if (cursorParam) {
    const decoded = decodeGalleryCursor(cursorParam, sort, direction);
    if (!decoded) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    cursorValue = decoded.value;
    cursorId = decoded.id;
  }

  const rows = await fetchGalleryPhotosPage(sort, direction, Boolean(cursorParam), cursorValue, cursorId);

  const photos = rows.map((row) => ({
    id: row.id,
    originalFilename: row.original_filename,
    uploaderName: row.uploader_name,
    uploadedAt: row.uploaded_at,
    width: row.width,
    height: row.height,
  }));

  let nextCursor: string | null = null;
  if (rows.length === GALLERY_PAGE_SIZE) {
    const last = rows[rows.length - 1];
    nextCursor = encodeGalleryCursor({
      sort,
      direction,
      value: sort === 'filename' ? last.filename_sort : last.uploaded_at,
      id: last.id,
    });
  }

  return NextResponse.json({ photos, nextCursor }, { headers: { 'Cache-Control': 'no-store' } });
}
