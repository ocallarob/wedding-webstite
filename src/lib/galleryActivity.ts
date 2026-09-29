import { sql } from './db';
import { isUuid } from './galleryConfig';


export async function recordGalleryOpen(householdId: string, sessionId: string | null): Promise<void> {
  if (!isUuid(sessionId)) return;

  try {
    await sql`
      INSERT INTO gallery_activity_events (household_id, event_type, session_id)
      VALUES (${householdId}::uuid, 'gallery_open', ${sessionId}::uuid)
      ON CONFLICT DO NOTHING
    `;
  } catch {
    // Gallery access remains available when analytics storage fails.
  }
}

export async function recordGalleryDownloadRequest(householdId: string, assetId: string): Promise<void> {
  try {
    await sql`
      INSERT INTO gallery_activity_events (household_id, event_type, asset_id)
      VALUES (${householdId}::uuid, 'download_request', ${assetId}::uuid)
    `;
  } catch {
    // Download access remains available when analytics storage fails.
  }
}
