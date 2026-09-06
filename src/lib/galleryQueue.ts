import { send } from '@vercel/queue';

export const GALLERY_PROCESSING_TOPIC = 'gallery-photo-processing';
const GALLERY_MESSAGE_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GalleryQueueMessage = {
  photoId: string;
  generation: number;
};

export function isGalleryQueueMessage(value: unknown): value is GalleryQueueMessage {
  if (!value || typeof value !== 'object') return false;
  const { photoId, generation } = value as Record<string, unknown>;
  return typeof photoId === 'string' && UUID_PATTERN.test(photoId) && typeof generation === 'number' && Number.isInteger(generation) && generation > 0;
}

// No idempotency key: callbacks and recovery may publish duplicates for the same
// photo/generation on purpose. The generation-aware database claim in
// galleryProcessor makes redelivery harmless, and skipping dedupe lets a fresh
// recovery dispatch go out before an earlier message's dedupe window would clear.
export async function enqueueGalleryPhoto(photoId: string, generation: number): Promise<void> {
  const payload: GalleryQueueMessage = { photoId, generation };
  await send(GALLERY_PROCESSING_TOPIC, payload, { retentionSeconds: GALLERY_MESSAGE_RETENTION_SECONDS });
}
