import { createHash, randomBytes } from 'node:crypto';
import { sql } from './db';
import { isUploadPortalToken, UPLOAD_PORTAL_TOKEN_TTL_SECONDS } from './galleryConfig';

export type UploadPortalCapability = {
  householdId: string;
  expiresAt: Date;
};

export type IssuedUploadPortalCapability = {
  token: string;
  expiresAt: Date;
};

export type UploadPortalCapabilityState =
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'valid'; capability: UploadPortalCapability };
export function hashUploadPortalToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}


export async function getUploadPortalCapabilityState(token: unknown): Promise<UploadPortalCapabilityState> {
  if (!isUploadPortalToken(token)) return { status: 'invalid' };

  const rows = await sql`
    SELECT up.household_id, up.expires_at, up.revoked_at,
      NULLIF(BTRIM(h.contact_email), '') IS NOT NULL AS contact_available
    FROM upload_portal_capabilities up
    INNER JOIN households h ON h.id = up.household_id
    WHERE up.token_hash = ${hashUploadPortalToken(token)}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.revoked_at != null || row.contact_available !== true) return { status: 'invalid' };

  const expiresAt = new Date(String(row.expires_at));
  if (expiresAt.getTime() <= Date.now()) return { status: 'expired' };

  return {
    status: 'valid',
    capability: {
      householdId: String(row.household_id),
      expiresAt,
    },
  };
}

export async function createUploadPortalCapability(
  householdId: string,
  replaceExisting = true,
): Promise<IssuedUploadPortalCapability> {
  const token = `up_${randomBytes(32).toString('base64url')}`;
  const tokenHash = hashUploadPortalToken(token);
  const expiresAt = new Date(Date.now() + UPLOAD_PORTAL_TOKEN_TTL_SECONDS * 1000);
  const rows = replaceExisting
    ? await sql`
        WITH eligible AS (
          SELECT id
          FROM households
          WHERE id = ${householdId}
            AND NULLIF(BTRIM(contact_email), '') IS NOT NULL
          LIMIT 1
        ), revoked AS (
          UPDATE upload_portal_capabilities
          SET revoked_at = COALESCE(revoked_at, now())
          WHERE household_id IN (SELECT id FROM eligible)
            AND revoked_at IS NULL
        ), created AS (
          INSERT INTO upload_portal_capabilities (household_id, token_hash, expires_at)
          SELECT eligible.id, ${tokenHash}, ${expiresAt.toISOString()}
          FROM eligible
          RETURNING id
        )
        SELECT id FROM created
      `
    : await sql`
        INSERT INTO upload_portal_capabilities (household_id, token_hash, expires_at)
        SELECT id, ${tokenHash}, ${expiresAt.toISOString()}
        FROM households
        WHERE id = ${householdId}
          AND NULLIF(BTRIM(contact_email), '') IS NOT NULL
        LIMIT 1
        RETURNING id
      `;

  if (!rows[0]) throw new Error('Household is not eligible for an Upload portal');
  return { token, expiresAt };
}

export async function revokeUploadPortalCapability(householdId: string, token: string): Promise<void> {
  await sql`
    UPDATE upload_portal_capabilities
    SET revoked_at = COALESCE(revoked_at, now())
    WHERE household_id = ${householdId}
      AND token_hash = ${hashUploadPortalToken(token)}
      AND revoked_at IS NULL
  `;
}

export async function revokeOtherUploadPortalCapabilities(householdId: string, token: string): Promise<void> {
  await sql`
    UPDATE upload_portal_capabilities
    SET revoked_at = COALESCE(revoked_at, now())
    WHERE household_id = ${householdId}
      AND token_hash <> ${hashUploadPortalToken(token)}
      AND revoked_at IS NULL
  `;
}

export async function revokeUploadPortalCapabilities(householdId: string): Promise<void> {
  await sql`
    UPDATE upload_portal_capabilities
    SET revoked_at = COALESCE(revoked_at, now())
    WHERE household_id = ${householdId}
      AND revoked_at IS NULL
  `;
}
