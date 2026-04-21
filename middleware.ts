import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isRoot = pathname === '/';
  const isInternal = pathname.startsWith('/_next') || pathname.startsWith('/api');
  const isPublicAsset = PUBLIC_FILE.test(pathname);

  if (isRoot || isInternal || isPublicAsset) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
