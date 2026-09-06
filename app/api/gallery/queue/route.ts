import { handleCallback } from '@vercel/queue';
import { processGalleryPhoto } from '../../../../src/lib/galleryProcessor';
import { isGalleryQueueMessage } from '../../../../src/lib/galleryQueue';

// Private queue consumer bound via vercel.json's experimentalTriggers — Vercel Queues
// authorizes delivery to this route directly; it is not reachable as a normal public API.
export const dynamic = 'force-dynamic';


const VISIBILITY_TIMEOUT_SECONDS = 300;
const MAX_BACKOFF_SECONDS = 300;
const BACKOFF_BASE_SECONDS = 30;

const queueCallback = handleCallback<unknown>(
  async (message) => {
    if (!isGalleryQueueMessage(message)) {
      console.warn('gallery queue: acknowledging malformed message');
      return;
    }
    // processGalleryPhoto resolves (ack) for success and for stale/terminal no-ops,
    // and throws only for a genuinely transient or in-flight-elsewhere condition.
    await processGalleryPhoto(message.photoId, message.generation);
  },
  {
    visibilityTimeoutSeconds: VISIBILITY_TIMEOUT_SECONDS,
    retry: (_error, metadata) => {
      const backoffSeconds = Math.min(MAX_BACKOFF_SECONDS, BACKOFF_BASE_SECONDS * 2 ** Math.max(metadata.deliveryCount - 1, 0));
      return { afterSeconds: backoffSeconds };
    },
  },
);

export async function POST(request: Request): Promise<Response> {
  return queueCallback({ request });
}
