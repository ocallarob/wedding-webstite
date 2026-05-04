import { createHmac, timingSafeEqual } from 'node:crypto';

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createCsrfToken(sessionToken: string, secret: string): string {
  const payload = Buffer.from(sessionToken, 'utf8').toString('base64url');
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyCsrfToken(token: string | undefined, sessionToken: string | undefined, secret: string): boolean {
  if (!token || !sessionToken) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, providedSig] = parts;

  const expectedPayload = Buffer.from(sessionToken, 'utf8').toString('base64url');
  if (payload !== expectedPayload) return false;

  const expectedSig = sign(payload, secret);
  const provided = Buffer.from(providedSig, 'base64url');
  const expected = Buffer.from(expectedSig, 'base64url');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
