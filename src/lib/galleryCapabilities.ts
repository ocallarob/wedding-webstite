import { createHash, randomBytes } from 'node:crypto';
import { sql } from './db';
import { GALLERY_TOKEN_TTL_SECONDS, isGalleryToken } from './galleryConfig';

export function hashGalleryToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function isValidGalleryCapability(token: unknown): Promise<boolean> {
  if (!isGalleryToken(token)) return false;

  const rows = await sql`
    SELECT id
    FROM gallery_capabilities
    WHERE token_hash = ${hashGalleryToken(token)}
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1
  `;

  return rows.length > 0;
}

export async function createGalleryCapability(): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + GALLERY_TOKEN_TTL_SECONDS * 1000);

  await sql`
    INSERT INTO gallery_capabilities (token_hash, expires_at)
    VALUES (${hashGalleryToken(token)}, ${expiresAt.toISOString()})
  `;

  return { token, expiresAt };
}

export async function revokeGalleryCapabilities(): Promise<void> {
  await sql`
    UPDATE gallery_capabilities
    SET revoked_at = COALESCE(revoked_at, now())
    WHERE revoked_at IS NULL
  `;
}
