import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';
import { checkRateLimit } from '../../../src/lib/rateLimit';
import {
  GALLERY_LIST_RATE_LIMIT,
  isGallerySourceFilter,
  isGalleryToken,
  type GalleryMediaType,
  type GalleryPhotoSource,
  type GallerySourceFilter,
} from '../../../src/lib/galleryConfig';
import { getGalleryCapabilityHouseholdId } from '../../../src/lib/galleryCapabilities';
import { recordGalleryOpen } from '../../../src/lib/galleryActivity';
import { createGallerySignedUrl } from '../../../src/lib/galleryStorage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GALLERY_PAGE_SIZE = 48;
const GALLERY_SOURCE_BLOCK_SIZE = 50;

type GalleryCursor = {
  position: string;
  photoSource: GalleryPhotoSource;
  source: GallerySourceFilter;
};

function decodeGalleryCursor(value: string | null, source: GallerySourceFilter): GalleryCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<GalleryCursor>;
    if (
      typeof parsed.position !== 'string'
      || !/^[1-9]\d{0,14}$/.test(parsed.position)
      || (parsed.photoSource !== 'guest' && parsed.photoSource !== 'professional')
      || !isGallerySourceFilter(parsed.source)
      || parsed.source !== source
    ) {
      return null;
    }

    return { position: parsed.position, photoSource: parsed.photoSource, source: parsed.source };
  } catch {
    return null;
  }
}

function encodeGalleryCursor(position: string, photoSource: GalleryPhotoSource, source: GallerySourceFilter): string {
  return Buffer.from(JSON.stringify({ position, photoSource, source }), 'utf8').toString('base64url');
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const cursorValue = request.nextUrl.searchParams.get('cursor');
  const sourceValue = request.nextUrl.searchParams.get('source') ?? 'all';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (!isGalleryToken(token)) {
    return NextResponse.json(
      { error: 'Invalid Gallery link' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!(await checkRateLimit(`gallery:list:ip:${ip}`, GALLERY_LIST_RATE_LIMIT))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
  }

  const householdId = await getGalleryCapabilityHouseholdId(token);
  if (!householdId) {
    return NextResponse.json(
      { error: 'Invalid Gallery link' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const source = sourceValue;
  if (!isGallerySourceFilter(source)) {
    return NextResponse.json(
      { error: 'Invalid gallery source' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }


  if (cursorValue && !decodeGalleryCursor(cursorValue, source)) {
    return NextResponse.json(
      { error: 'Invalid gallery cursor' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const cursor = decodeGalleryCursor(cursorValue, source);
  const rows = await sql`
    WITH ranked AS (
      SELECT
        public_key,
        media_type,
        photo_source,
        storage_key,
        thumbnail_key,
        content_type,
        size_bytes,
        display_name,
        created_at,
        moderation_status,
        row_number() OVER (PARTITION BY photo_source ORDER BY created_at, public_key) AS position
      FROM gallery_assets
      WHERE moderation_status = 'published'
        AND (${source} = 'all' OR photo_source = ${source})
    )
    SELECT * FROM ranked
    WHERE ${cursor?.position ?? '0'}::bigint = 0
       OR ((position - 1) / ${GALLERY_SOURCE_BLOCK_SIZE}, CASE photo_source WHEN 'professional' THEN 0 ELSE 1 END, position)
          > (((${cursor?.position ?? '0'}::bigint - 1) / ${GALLERY_SOURCE_BLOCK_SIZE}), ${cursor?.photoSource === 'professional' ? 0 : 1}, ${cursor?.position ?? '0'}::bigint)
    ORDER BY (position - 1) / ${GALLERY_SOURCE_BLOCK_SIZE}, CASE photo_source WHEN 'professional' THEN 0 ELSE 1 END, position
    LIMIT ${GALLERY_PAGE_SIZE + 1}
  `;

  const assets = rows.filter((row) => row.moderation_status === 'published').map((row) => ({
    asset_key: String(row.public_key),
    media_type: row.media_type as GalleryMediaType,
    photo_source: row.photo_source as GalleryPhotoSource,
    preview_storage_key: String(row.thumbnail_key ?? row.storage_key),
    content_type: String(row.content_type),
    size_bytes: Number(row.size_bytes),
    display_name: String(row.display_name),
    created_at: row.created_at,
    position: String(row.position),
  }));
  const hasMore = assets.length > GALLERY_PAGE_SIZE;
  const pageAssets = hasMore ? assets.slice(0, GALLERY_PAGE_SIZE) : assets;
  const lastAsset = pageAssets[pageAssets.length - 1];
  const nextCursor = hasMore && lastAsset
    ? encodeGalleryCursor(lastAsset.position, lastAsset.photo_source, source)
    : null;
  const responseAssets = await Promise.all(pageAssets.map(async ({
    position: _position,
    preview_storage_key,
    ...asset
  }) => {
    try {
      const signed = await createGallerySignedUrl(preview_storage_key, { useCache: true });
      return { ...asset, preview_url: signed.url };
    } catch {
      return { ...asset, preview_url: null };
    }
  }));
  if (!cursor) await recordGalleryOpen(householdId, request.headers.get('x-gallery-session'));

  return NextResponse.json(
    { assets: responseAssets, next_cursor: nextCursor },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
