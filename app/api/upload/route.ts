import { randomBytes } from 'node:crypto';
import { del, head } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';
import { checkRateLimit } from '../../../src/lib/rateLimit';
import {
  UPLOAD_MAX_ASSET_BYTES,
  UPLOAD_MAX_ASSETS_PER_VISIT,
  UPLOAD_PORTAL_CALLBACK_RATE_LIMIT,
  UPLOAD_PORTAL_CONFIRM_RATE_LIMIT,
  UPLOAD_PORTAL_CONTRIBUTION_RATE_LIMIT,
  UPLOAD_PORTAL_INIT_RATE_LIMIT,
  UPLOAD_PORTAL_SESSION_TTL_SECONDS,
  isUploadPortalToken,
} from '../../../src/lib/galleryConfig';
import { getUploadPortalCapabilityState, hashUploadPortalToken } from '../../../src/lib/uploadPortalCapabilities';
import { isUploadPathname, validateUploadAsset, type ValidatedUploadAsset } from '../../../src/lib/uploadValidation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type UploadClientPayload = {
  sessionId: string;
  asset: ValidatedUploadAsset;
};

type UploadTokenPayload = UploadClientPayload & { pathname: string };

type BlobUploadBody = {
  type: string;
  payload: Record<string, unknown>;
};

class UploadRouteError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function errorResponse(error: string, status: number, details?: { errors: Array<{ index: number; message: string }> }) {
  return NextResponse.json(
    details ? { error, errors: details.errors } : { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function requestIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

type RateLimitConfig = { limit: number; windowSeconds: number };

function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSessionUploadPathname(pathname: unknown, sessionId: string): pathname is string {
  return isUploadPathname(pathname) && pathname.startsWith(`guest-submissions/${sessionId}/`);
}

function parseClientPayload(value: unknown): UploadClientPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof value === 'string' ? value : '');
  } catch {
    throw new UploadRouteError(400, 'Upload metadata is invalid. Select the asset again.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new UploadRouteError(400, 'Upload session is invalid. Start a new contribution.');
  }
  const payload = parsed as {
    session_id?: unknown;
    display_name?: unknown;
    content_type?: unknown;
    size_bytes?: unknown;
  };
  if (!isSessionId(payload.session_id)) {
    throw new UploadRouteError(400, 'Upload session is invalid. Start a new contribution.');
  }

  const validation = validateUploadAsset({
    displayName: payload.display_name,
    contentType: payload.content_type,
    sizeBytes: payload.size_bytes,
  });
  if (!validation.ok) throw new UploadRouteError(400, validation.message);

  return { sessionId: payload.session_id, asset: validation.asset };
}

function parseTokenPayload(value: unknown): UploadTokenPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof value === 'string' ? value : '');
  } catch {
    throw new UploadRouteError(400, 'Upload completion metadata is invalid.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new UploadRouteError(400, 'Upload completion metadata is invalid.');
  }
  const payload = parsed as {
    session_id?: unknown;
    pathname?: unknown;
    display_name?: unknown;
    content_type?: unknown;
    size_bytes?: unknown;
  };
  if (!isSessionId(payload.session_id)) {
    throw new UploadRouteError(400, 'Upload completion metadata is invalid.');
  }
  if (!isSessionUploadPathname(payload.pathname, payload.session_id)) {
    throw new UploadRouteError(400, 'Upload completion metadata is invalid.');
  }

  const validation = validateUploadAsset({
    displayName: payload.display_name,
    contentType: payload.content_type,
    sizeBytes: payload.size_bytes,
  });
  if (!validation.ok) throw new UploadRouteError(400, validation.message);

  return { sessionId: payload.session_id, asset: validation.asset, pathname: payload.pathname };
}

async function getValidCapability(token: unknown) {
  if (!isUploadPortalToken(token)) throw new UploadRouteError(404, 'Invalid Upload portal link');

  const state = await getUploadPortalCapabilityState(token);
  if (state.status === 'expired') throw new UploadRouteError(410, 'Upload portal link expired');
  if (state.status !== 'valid') throw new UploadRouteError(404, 'Invalid Upload portal link');
  return state.capability;
}

async function requireRateLimit(key: string, config: RateLimitConfig, message: string) {
  if (!(await checkRateLimit(key, config))) throw new UploadRouteError(429, message);
}

function parseInitiationAssets(value: unknown): { assets: ValidatedUploadAsset[]; errors: Array<{ index: number; message: string }> } {
  if (!Array.isArray(value) || value.length === 0) {
    return { assets: [], errors: [{ index: 0, message: 'Select at least one photograph or video.' }] };
  }
  if (value.length > UPLOAD_MAX_ASSETS_PER_VISIT) {
    return { assets: [], errors: [{ index: 0, message: `You can contribute up to ${UPLOAD_MAX_ASSETS_PER_VISIT} assets per visit.` }] };
  }

  const assets: ValidatedUploadAsset[] = [];
  const errors: Array<{ index: number; message: string }> = [];
  value.forEach((item, index) => {
    const itemObject = typeof item === 'object' && item !== null && !Array.isArray(item) ? item : null;
    const input = itemObject
      && 'name' in itemObject
      && 'content_type' in itemObject
      && 'size_bytes' in itemObject
      ? { displayName: itemObject.name, contentType: itemObject.content_type, sizeBytes: itemObject.size_bytes }
      : { displayName: null, contentType: null, sizeBytes: null };
    const validation = validateUploadAsset(input);
    if (!validation.ok) {
      errors.push({ index, message: validation.message });
      return;
    }
    assets.push(validation.asset);
  });

  return { assets, errors };
}

async function initiateUpload(request: NextRequest, body: Record<string, unknown>) {
  const parsed = parseInitiationAssets(body.assets);
  if (parsed.errors.length > 0) {
    return errorResponse('Some selected assets are invalid', 400, { errors: parsed.errors });
  }

  const token = request.nextUrl.searchParams.get('token');
  const capability = await getValidCapability(token);
  await requireRateLimit(`upload-portal:contribution:ip:${requestIp(request)}`, UPLOAD_PORTAL_CONTRIBUTION_RATE_LIMIT, 'Too many upload attempts');

  const expiresAt = new Date(Date.now() + UPLOAD_PORTAL_SESSION_TTL_SECONDS * 1000);
  const rows = await sql`
    INSERT INTO gallery_upload_sessions (
      household_id,
      capability_token_hash,
      asset_count,
      expires_at
    )
    VALUES (
      ${capability.householdId},
      ${hashUploadPortalToken(token!)},
      ${parsed.assets.length},
      ${expiresAt.toISOString()}
    )
    RETURNING id, expires_at
  `;
  if (!rows[0]) throw new UploadRouteError(503, 'Upload service unavailable. Try again shortly.');

  return NextResponse.json(
    { upload_session_id: String(rows[0].id), expires_at: new Date(String(rows[0].expires_at)).toISOString() },
    { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function reserveUploadSlot(sessionId: string, householdId: string, token: string): Promise<Date> {
  const rows = await sql`
    UPDATE gallery_upload_sessions
    SET issued_count = issued_count + 1
    WHERE id = ${sessionId}
      AND household_id = ${householdId}
      AND capability_token_hash = ${hashUploadPortalToken(token)}
      AND expires_at > now()
      AND issued_count < asset_count
    RETURNING expires_at
  `;
  if (!rows[0]) throw new UploadRouteError(400, 'This upload visit is full or expired. Start a new contribution.');
  return new Date(String(rows[0].expires_at));
}

async function persistCompletedUpload(payload: UploadTokenPayload, storageKey: string): Promise<boolean> {
  if (!isSessionUploadPathname(storageKey, payload.sessionId)) {
    throw new UploadRouteError(400, 'The uploaded asset could not be verified.');
  }

  const sessions = await sql`
    SELECT household_id
    FROM gallery_upload_sessions
    WHERE id = ${payload.sessionId}
    LIMIT 1
  `;
  const session = sessions[0];
  if (!session) throw new UploadRouteError(400, 'This upload visit is no longer available.');

  const blobMetadata = await head(storageKey);
  const validation = validateUploadAsset({
    displayName: payload.asset.displayName,
    contentType: blobMetadata.contentType,
    sizeBytes: blobMetadata.size,
  });
  if (!validation.ok || validation.asset.mediaType !== payload.asset.mediaType) {
    try {
      await del(storageKey);
    } catch {
      // The callback remains safe to retry if cleanup is temporarily unavailable.
    }
    throw new UploadRouteError(400, 'The uploaded asset did not meet the contribution limits.');
  }

  const publicKey = `asset_${randomBytes(24).toString('base64url')}`;
  const inserted = await sql`
    INSERT INTO gallery_assets (
      public_key,
      household_id,
      storage_key,
      media_type,
      content_type,
      size_bytes,
      display_name,
      moderation_status
    )
    VALUES (
      ${publicKey},
      ${String(session.household_id)},
      ${storageKey},
      ${validation.asset.mediaType},
      ${validation.asset.contentType},
      ${validation.asset.sizeBytes},
      ${validation.asset.displayName},
      'pending'
    )
    ON CONFLICT (storage_key) DO NOTHING
    RETURNING id
  `;
  if (inserted.length > 0) {
    await sql`
      UPDATE gallery_upload_sessions
      SET completed_count = completed_count + 1
      WHERE id = ${payload.sessionId}
    `;
  }
  return inserted.length > 0;
}

async function recordCompletedUpload({ blob, tokenPayload }: { blob: unknown; tokenPayload?: string | null }) {
  const payload = parseTokenPayload(tokenPayload);
  if (typeof blob !== 'object' || blob === null || Array.isArray(blob) || !('pathname' in blob)) {
    throw new UploadRouteError(400, 'The uploaded asset could not be verified.');
  }
  if (!isSessionUploadPathname(blob.pathname, payload.sessionId)) {
    throw new UploadRouteError(400, 'The uploaded asset could not be verified.');
  }
  await persistCompletedUpload(payload, blob.pathname);
}


async function confirmUpload(request: NextRequest, body: Record<string, unknown>) {
  const payload = parseTokenPayload(JSON.stringify({
    session_id: body.session_id,
    pathname: body.pathname,
    display_name: body.display_name,
    content_type: body.content_type,
    size_bytes: body.size_bytes,
  }));
  const token = request.nextUrl.searchParams.get('token');
  const capability = await getValidCapability(token);
  await requireRateLimit(`upload-portal:confirm:ip:${requestIp(request)}`, UPLOAD_PORTAL_CONFIRM_RATE_LIMIT, 'Too many upload confirmations');

  const sessions = await sql`
    SELECT household_id
    FROM gallery_upload_sessions
    WHERE id = ${payload.sessionId}
      AND household_id = ${capability.householdId}
      AND capability_token_hash = ${hashUploadPortalToken(token!)}
    LIMIT 1
  `;
  if (!sessions[0]) throw new UploadRouteError(400, 'This upload visit is no longer available.');

  const inserted = await persistCompletedUpload(payload, payload.pathname);
  return NextResponse.json(
    { status: 'pending', awaiting_review: true },
    { status: inserted ? 201 : 200, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
async function handleBlobUpload(request: NextRequest, body: BlobUploadBody) {
  if (body.type === 'blob.generate-client-token') {
    const payload = body.payload;
    if (typeof payload.pathname !== 'string' || !isUploadPathname(payload.pathname)) {
      throw new UploadRouteError(400, 'Upload path is invalid. Select the asset again.');
    }

    const clientPayload = parseClientPayload(payload.clientPayload);
    const token = request.nextUrl.searchParams.get('token');
    const capability = await getValidCapability(token);
    await requireRateLimit(`upload-portal:contribution:ip:${requestIp(request)}`, UPLOAD_PORTAL_CONTRIBUTION_RATE_LIMIT, 'Too many upload attempts');

    const jsonResponse = await handleUpload({
      body: body as unknown as HandleUploadBody,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (pathname !== payload.pathname) throw new UploadRouteError(400, 'Upload path is invalid. Select the asset again.');
        const expiresAt = await reserveUploadSlot(clientPayload.sessionId, capability.householdId, token!);
        return {
          allowedContentTypes: [clientPayload.asset.contentType],
          maximumSizeInBytes: UPLOAD_MAX_ASSET_BYTES,
          validUntil: expiresAt.getTime(),
          addRandomSuffix: true,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({
            session_id: clientPayload.sessionId,
            pathname,
            display_name: clientPayload.asset.displayName,
            content_type: clientPayload.asset.contentType,
            size_bytes: clientPayload.asset.sizeBytes,
          }),
        };
      },
      onUploadCompleted: recordCompletedUpload,
    });
    return NextResponse.json(jsonResponse, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (body.type === 'blob.upload-completed') {
    const tokenPayload = body.payload.tokenPayload;
    let sessionId = 'unknown';
    try {
      const parsed = JSON.parse(typeof tokenPayload === 'string' ? tokenPayload : '');
      if (
        typeof parsed === 'object'
        && parsed !== null
        && !Array.isArray(parsed)
        && 'session_id' in parsed
        && isSessionId(parsed.session_id)
      ) {
        sessionId = parsed.session_id;
      }
    } catch {
      // handleUpload returns the safe invalid-completion response below.
    }
    await requireRateLimit(`upload-portal:callback:${sessionId}:${requestIp(request)}`, UPLOAD_PORTAL_CALLBACK_RATE_LIMIT, 'Too many upload callbacks');

    const jsonResponse = await handleUpload({
      body: body as unknown as HandleUploadBody,
      request,
      onBeforeGenerateToken: async () => {
        throw new UploadRouteError(400, 'Upload request is invalid.');
      },
      onUploadCompleted: recordCompletedUpload,
    });
    return NextResponse.json(jsonResponse, { headers: { 'Cache-Control': 'no-store' } });
  }

  throw new UploadRouteError(400, 'Upload request is invalid.');
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!isUploadPortalToken(token)) return errorResponse('Invalid Upload portal link', 404);

  const ip = requestIp(request);

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

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Upload request is invalid.', 400);
  }

  try {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return errorResponse('Upload request is invalid.', 400);
    }
    const requestBody = body as {
      action?: unknown;
      assets?: unknown;
      type?: unknown;
      payload?: unknown;
      session_id?: unknown;
      pathname?: unknown;
      display_name?: unknown;
      content_type?: unknown;
      size_bytes?: unknown;
    };
    if (requestBody.action === 'initiate') {
      return await initiateUpload(request, { assets: requestBody.assets });
    }
    if (requestBody.action === 'confirm') {
      return await confirmUpload(request, {
        session_id: requestBody.session_id,
        pathname: requestBody.pathname,
        display_name: requestBody.display_name,
        content_type: requestBody.content_type,
        size_bytes: requestBody.size_bytes,
      });
    }
    if (
      typeof requestBody.type !== 'string'
      || typeof requestBody.payload !== 'object'
      || requestBody.payload === null
      || Array.isArray(requestBody.payload)
    ) {
      return errorResponse('Upload request is invalid.', 400);
    }
    return await handleBlobUpload(request, {
      type: requestBody.type,
      payload: requestBody.payload as Record<string, unknown>,
    });
  } catch (error) {
    if (error instanceof UploadRouteError) return errorResponse(error.message, error.status);
    return errorResponse('Upload provider unavailable. Try again shortly.', 503);
  }
}
