import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GALLERY_ACCESS_COOKIE_NAME, createGallerySessionToken, gallerySessionFromRequest } from '../../../src/lib/galleryAuth';
import { GALLERY_COOKIE_MAX_AGE_SECONDS, getGalleryConfig } from '../../../src/lib/galleryConfig';
import { checkRateLimit } from '../../../src/lib/rateLimit';

export const dynamic = 'force-dynamic';

// Every response from this route — success or not — is private and unattributable
// to the referring page, since the URL itself carries the shared secret token.
function withAccessResponseHeaders<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function GET(request: NextRequest) {
  let accessToken: string;
  let sessionSecret: string;
  try {
    ({ accessToken, sessionSecret } = getGalleryConfig());
  } catch {
    return withAccessResponseHeaders(NextResponse.json({ error: 'Gallery is not configured' }, { status: 503 }));
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const allowed = await checkRateLimit(`gallery:access:ip:${ip}`, { limit: 30, windowSeconds: 60 });
  if (!allowed) {
    return withAccessResponseHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
  }

  const providedToken = Buffer.from(request.nextUrl.searchParams.get('token') ?? '');
  const expectedToken = Buffer.from(accessToken);
  const validToken = providedToken.length === expectedToken.length && timingSafeEqual(providedToken, expectedToken);
  if (!validToken) {
    return withAccessResponseHeaders(NextResponse.json({ error: 'Not found' }, { status: 404 }));
  }

  const browserId = gallerySessionFromRequest(request)?.browserId ?? randomUUID();
  const sessionToken = createGallerySessionToken(sessionSecret, browserId);

  const response = NextResponse.redirect(new URL('/gallery', request.url));
  response.cookies.set(GALLERY_ACCESS_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GALLERY_COOKIE_MAX_AGE_SECONDS,
  });
  return withAccessResponseHeaders(response);
}
