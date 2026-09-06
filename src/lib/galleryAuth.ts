import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { getGalleryConfig } from './galleryConfig';

export const GALLERY_ACCESS_COOKIE_NAME = 'gallery_access';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_VERSION = 1;

type GallerySessionPayload = { v: number; b: string };

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function unbase64url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * The payload carries only a version tag and a random browser id — never the
 * shared access token, a secret, or a household identity — and is signed
 * exclusively with `GALLERY_SESSION_SECRET`.
 */
export function createGallerySessionToken(sessionSecret: string, browserId: string = randomUUID()): string {
  const payload = base64url(JSON.stringify({ v: TOKEN_VERSION, b: browserId } satisfies GallerySessionPayload));
  return `${payload}.${sign(payload, sessionSecret)}`;
}

export function verifyGallerySessionToken(value: string | undefined, sessionSecret: string): { browserId: string } | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [payload, providedSig] = parts;

  const expectedSig = sign(payload, sessionSecret);
  let provided: Buffer;
  let expected: Buffer;
  try {
    provided = Buffer.from(providedSig, 'base64url');
    expected = Buffer.from(expectedSig, 'base64url');
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const parsed = JSON.parse(unbase64url(payload)) as Partial<GallerySessionPayload>;
    if (parsed.v !== TOKEN_VERSION || typeof parsed.b !== 'string' || !UUID_PATTERN.test(parsed.b)) return null;
    return { browserId: parsed.b };
  } catch {
    return null;
  }
}

/**
 * Returns no session when gallery configuration is absent/invalid rather than
 * throwing, so unrelated public routes keep rendering normally.
 */
export function gallerySessionFromRequest(request: NextRequest): { browserId: string } | null {
  let sessionSecret: string;
  try {
    ({ sessionSecret } = getGalleryConfig());
  } catch {
    return null;
  }
  return verifyGallerySessionToken(request.cookies.get(GALLERY_ACCESS_COOKIE_NAME)?.value, sessionSecret);
}

/**
 * Server Component / layout variant of `gallerySessionFromRequest`: reads the
 * ambient request cookies via `next/headers` instead of a `NextRequest`.
 * Returns `false` (never throws) when gallery configuration is absent/invalid.
 */
export async function hasGalleryAccess(): Promise<boolean> {
  let sessionSecret: string;
  try {
    ({ sessionSecret } = getGalleryConfig());
  } catch {
    return false;
  }
  const cookieStore = await cookies();
  return verifyGallerySessionToken(cookieStore.get(GALLERY_ACCESS_COOKIE_NAME)?.value, sessionSecret) !== null;
}
