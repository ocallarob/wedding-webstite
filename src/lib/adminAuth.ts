import { NextRequest } from 'next/server';

export const ADMIN_COOKIE_NAME = 'admin_session';

export function hasAdminAuth(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return false;
  const secretHeader = request.headers.get('x-admin-secret');
  const cookieSecret = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return secretHeader === adminSecret || cookieSecret === adminSecret;
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const requestOrigin = request.nextUrl.origin;
  return origin === requestOrigin;
}
