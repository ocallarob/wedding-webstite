import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '../../../src/lib/rateLimit';
import { UPLOAD_PORTAL_INIT_RATE_LIMIT, isUploadPortalToken } from '../../../src/lib/galleryConfig';
import { getUploadPortalCapabilityState } from '../../../src/lib/uploadPortalCapabilities';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!isUploadPortalToken(token)) return errorResponse('Invalid Upload portal link', 404);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  try {
    if (!(await checkRateLimit(`upload-portal:init:ip:${ip}`, UPLOAD_PORTAL_INIT_RATE_LIMIT))) {
      return errorResponse('Too many requests', 429);
    }

    const state = await getUploadPortalCapabilityState(token);
    if (state.status === 'expired') return errorResponse('Upload portal link expired', 410);
    if (state.status !== 'valid') return errorResponse('Invalid Upload portal link', 404);

    return NextResponse.json(
      { authorized: true, expires_at: state.capability.expiresAt.toISOString() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return errorResponse('Upload portal unavailable', 503);
  }
}
