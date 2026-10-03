import { createHash, randomBytes } from 'node:crypto';
import { sql } from './db';
import { GALLERY_TOKEN_TTL_SECONDS, isGalleryToken } from './galleryConfig';

export function hashGalleryToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export type IssuedGalleryCapability = {
  token: string;
  expiresAt: Date;
};


export async function getGalleryCapabilityHouseholdId(token: unknown): Promise<string | null> {
  if (!isGalleryToken(token)) return null;

  const rows = await sql`
    SELECT household_id
    FROM gallery_capabilities
    WHERE token_hash = ${hashGalleryToken(token)}
      AND household_id IS NOT NULL
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1
  `;

  return rows[0]?.household_id ? String(rows[0].household_id) : null;
}

export async function isValidGalleryCapability(token: unknown): Promise<boolean> {
  return (await getGalleryCapabilityHouseholdId(token)) !== null;
}

export async function createGalleryCapability(householdId: string): Promise<IssuedGalleryCapability> {
  const capability = {
    token: randomBytes(32).toString('base64url'),
    expiresAt: new Date(Date.now() + GALLERY_TOKEN_TTL_SECONDS * 1000),
  };
  const rows = await sql`
    INSERT INTO gallery_capabilities (household_id, token_hash, expires_at)
    SELECT
      h.id,
      ${hashGalleryToken(capability.token)},
      ${capability.expiresAt.toISOString()}
    FROM households h
    WHERE h.id = ${householdId}::uuid
      AND NULLIF(BTRIM(h.contact_email), '') IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM household_members eligible_member
        WHERE eligible_member.household_id = h.id
          AND (eligible_member.attending_day1 IS TRUE OR eligible_member.attending_day2 IS TRUE)
      )
    RETURNING id
  `;
  if (rows.length === 0) throw new Error('Household is not eligible for Gallery access');
  return capability;
}

export async function rotateGalleryCapability(householdId: string): Promise<IssuedGalleryCapability | null> {
  const capability = {
    token: randomBytes(32).toString('base64url'),
    expiresAt: new Date(Date.now() + GALLERY_TOKEN_TTL_SECONDS * 1000),
  };
  const rows = await sql`
    WITH target AS (
      SELECT h.id
      FROM households h
      WHERE h.id = ${householdId}::uuid
        AND NULLIF(BTRIM(h.contact_email), '') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM household_members eligible_member
          WHERE eligible_member.household_id = h.id
            AND (eligible_member.attending_day1 IS TRUE OR eligible_member.attending_day2 IS TRUE)
        )
    ),
    revoked AS (
      UPDATE gallery_capabilities
      SET revoked_at = now()
      WHERE household_id = (SELECT id FROM target)
        AND revoked_at IS NULL
      RETURNING id
    ),
    created AS (
      INSERT INTO gallery_capabilities (household_id, token_hash, expires_at)
      SELECT
        target.id,
        ${hashGalleryToken(capability.token)},
        ${capability.expiresAt.toISOString()}
      FROM target
      CROSS JOIN (SELECT COUNT(*) FROM revoked) AS revoked_count
      RETURNING id
    )
    SELECT id FROM created
  `;

  return rows.length > 0 ? capability : null;
}
