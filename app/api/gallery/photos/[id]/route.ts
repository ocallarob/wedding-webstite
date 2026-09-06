import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../../../src/lib/db';
import { gallerySessionFromRequest } from '../../../../../src/lib/galleryAuth';
import { galleryDisplayPath, galleryThumbnailPath, presignGalleryDerivative, streamGalleryBlob } from '../../../../../src/lib/galleryStorage';
import { galleryDownloadDisposition } from '../../../../../src/lib/galleryValidation';
import { checkRateLimit } from '../../../../../src/lib/rateLimit';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = gallerySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipAllowed = await checkRateLimit(`gallery:media:ip:${ip}`, { limit: 600, windowSeconds: 60 });
  const browserAllowed = await checkRateLimit(`gallery:media:browser:${session.browserId}`, { limit: 600, windowSeconds: 60 });
  if (!ipAllowed || !browserAllowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const variant = request.nextUrl.searchParams.get('variant');
  if (variant === 'original') {
    return NextResponse.json({ error: 'The original variant is not available' }, { status: 400 });
  }
  if (variant !== 'thumbnail' && variant !== 'display' && variant !== 'download') {
    return NextResponse.json({ error: '"variant" must be thumbnail, display, or download' }, { status: 400 });
  }

  // Never distinguish an unknown id from an unpublished (not-yet-ready) one.
  const rows = await sql`SELECT original_filename FROM gallery_photos WHERE id = ${id}::uuid AND status = 'ready'`;
  const photo = rows[0] as { original_filename: string } | undefined;
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (variant === 'thumbnail' || variant === 'display') {
    const pathname =
      variant === 'thumbnail' ? galleryThumbnailPath(id, photo.original_filename) : galleryDisplayPath(id, photo.original_filename);
    const signedUrl = await presignGalleryDerivative(pathname);
    return NextResponse.redirect(signedUrl, { status: 302, headers: { 'Cache-Control': 'no-store' } });
  }

  const { stream } = await streamGalleryBlob(galleryDisplayPath(id, photo.original_filename));
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': galleryDownloadDisposition(photo.original_filename),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
