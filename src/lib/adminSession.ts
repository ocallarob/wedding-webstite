import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function unbase64url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createAdminSessionToken(secret: string, nowMs: number = Date.now()): string {
  const expiresAt = nowMs + SESSION_TTL_SECONDS * 1000;
  const payload = base64url(JSON.stringify({ exp: expiresAt }));
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyAdminSessionToken(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, providedSig] = parts;
  const expectedSig = sign(payload, secret);
  const provided = Buffer.from(providedSig, 'base64url');
  const expected = Buffer.from(expectedSig, 'base64url');
  if (provided.length !== expected.length) return false;
  if (!timingSafeEqual(provided, expected)) return false;

  try {
    const parsed = JSON.parse(unbase64url(payload)) as { exp?: unknown };
    if (typeof parsed.exp !== 'number') return false;
    return parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export { SESSION_TTL_SECONDS };
