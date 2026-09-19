import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../../../../src/lib/db';
import { checkRateLimit } from '../../../../../../src/lib/rateLimit';
import {
  GALLERY_URL_RATE_LIMIT,
  isGalleryToken,
} from '../../../../../../src/lib/galleryConfig';
import { isValidGalleryCapability } from '../../../../../../src/lib/galleryCapabilities';
import { createGallerySignedUrl } from '../../../../../../src/lib/galleryStorage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: { assetKey: string };
};

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  const token = request.nextUrl.searchParams.get('token');
  const download = request.nextUrl.searchParams.get('download') === '1';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (!isGalleryToken(token)) {
    return errorResponse('Invalid Gallery link', 404);
  }

  if (!(await checkRateLimit(`gallery:url:ip:${ip}`, GALLERY_URL_RATE_LIMIT))) {
    return errorResponse('Too many requests', 429);
  }

  if (!(await isValidGalleryCapability(token))) {
    return errorResponse('Invalid Gallery link', 404);
  }

  const rows = await sql`
    SELECT storage_key
    FROM gallery_assets
    WHERE public_key = ${context.params.assetKey}
      AND moderation_status = 'published'
    LIMIT 1
  `;
  const asset = rows[0];

  if (!asset) return errorResponse('Asset unavailable', 404);

  try {
    const signed = await createGallerySignedUrl(String(asset.storage_key), { download });
    return NextResponse.json(
      { url: signed.url, expires_at: signed.expiresAt.toISOString() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return errorResponse('Asset is temporarily unavailable', 503);
  }
}
