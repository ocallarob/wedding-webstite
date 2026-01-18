import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isSaveTheDate = pathname === '/save-the-date' || pathname.startsWith('/save-the-date/');
  const isInternal = pathname.startsWith('/_next') || pathname.startsWith('/api');
  const isPublicAsset = PUBLIC_FILE.test(pathname);

  if (isSaveTheDate || isInternal || isPublicAsset) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/save-the-date', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
