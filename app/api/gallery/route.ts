import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';
import { checkRateLimit } from '../../../src/lib/rateLimit';
import {
  GALLERY_LIST_RATE_LIMIT,
  isGalleryToken,
  type GalleryMediaType,
} from '../../../src/lib/galleryConfig';
import { getGalleryCapabilityHouseholdId } from '../../../src/lib/galleryCapabilities';
import { recordGalleryOpen } from '../../../src/lib/galleryActivity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GALLERY_PAGE_SIZE = 24;

type GalleryCursor = {
  createdAt: string;
  assetKey: string;
};

function decodeGalleryCursor(value: string | null): GalleryCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<GalleryCursor>;
    if (
      typeof parsed.createdAt !== 'string'
      || Number.isNaN(Date.parse(parsed.createdAt))
      || typeof parsed.assetKey !== 'string'
      || parsed.assetKey.length === 0
      || parsed.assetKey.length > 256
    ) {
      return null;
    }

    return { createdAt: parsed.createdAt, assetKey: parsed.assetKey };
  } catch {
    return null;
  }
}

function encodeGalleryCursor(createdAt: string, assetKey: string): string {
  return Buffer.from(JSON.stringify({ createdAt, assetKey }), 'utf8').toString('base64url');
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const cursorValue = request.nextUrl.searchParams.get('cursor');
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

  if (cursorValue && !decodeGalleryCursor(cursorValue)) {
    return NextResponse.json(
      { error: 'Invalid gallery cursor' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const cursor = decodeGalleryCursor(cursorValue);
  const rows = cursor
    ? await sql`
        SELECT
          public_key,
          media_type,
          content_type,
          size_bytes,
          display_name,
          created_at,
          created_at::text AS created_at_cursor,
          moderation_status
        FROM gallery_assets
        WHERE moderation_status = 'published'
          AND (created_at, public_key) > (${cursor.createdAt}::timestamptz, ${cursor.assetKey})
        ORDER BY created_at ASC, public_key ASC
        LIMIT ${GALLERY_PAGE_SIZE + 1}
      `
    : await sql`
        SELECT
          public_key,
          media_type,
          content_type,
          size_bytes,
          display_name,
          created_at,
          created_at::text AS created_at_cursor,
          moderation_status
        FROM gallery_assets
        WHERE moderation_status = 'published'
        ORDER BY created_at ASC, public_key ASC
        LIMIT ${GALLERY_PAGE_SIZE + 1}
      `;

  const assets = rows
    .filter((row) => row.moderation_status === 'published')
    .map((row) => ({
      asset_key: String(row.public_key),
      media_type: row.media_type as GalleryMediaType,
      content_type: String(row.content_type),
      size_bytes: Number(row.size_bytes),
      display_name: String(row.display_name),
      created_at: row.created_at,
      created_at_cursor: String(row.created_at_cursor ?? row.created_at),
    }));
  const hasMore = assets.length > GALLERY_PAGE_SIZE;
  const pageAssets = hasMore ? assets.slice(0, GALLERY_PAGE_SIZE) : assets;
  const lastAsset = pageAssets[pageAssets.length - 1];
  const nextCursor = hasMore && lastAsset
    ? encodeGalleryCursor(lastAsset.created_at_cursor, lastAsset.asset_key)
    : null;
  const responseAssets = pageAssets.map(({ created_at_cursor: _createdAtCursor, ...asset }) => asset);
  if (!cursor) await recordGalleryOpen(householdId, request.headers.get('x-gallery-session'));

  return NextResponse.json(
    { assets: responseAssets, next_cursor: nextCursor },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
