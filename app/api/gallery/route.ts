import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';
import { checkRateLimit } from '../../../src/lib/rateLimit';
import {
  GALLERY_LIST_RATE_LIMIT,
  isGalleryToken,
  type GalleryMediaType,
} from '../../../src/lib/galleryConfig';
import { isValidGalleryCapability } from '../../../src/lib/galleryCapabilities';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
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

  if (!(await isValidGalleryCapability(token))) {
    return NextResponse.json(
      { error: 'Invalid Gallery link' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const rows = await sql`
    SELECT
      public_key,
      media_type,
      content_type,
      size_bytes,
      display_name,
      created_at,
      moderation_status
    FROM gallery_assets
    WHERE moderation_status = 'published'
    ORDER BY created_at DESC
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
    }));

  return NextResponse.json(
    { assets },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
