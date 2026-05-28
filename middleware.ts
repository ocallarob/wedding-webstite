import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isRoot = pathname === '/';
  const isInternal = pathname.startsWith('/_next') || pathname.startsWith('/api');
  const isPublicAsset = PUBLIC_FILE.test(pathname);

  const isAllowedRoute =
    pathname.startsWith('/rsvp') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/our-story') ||
    pathname.startsWith('/wedding-party') ||
    pathname.startsWith('/weekend') ||
    pathname.startsWith('/travel') ||
    pathname.startsWith('/faq') ||
    pathname.startsWith('/gallery') ||
    pathname.startsWith('/save-the-date') ||
    pathname.startsWith('/invite-email-preview');

  if (isRoot || isInternal || isPublicAsset || isAllowedRoute) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
