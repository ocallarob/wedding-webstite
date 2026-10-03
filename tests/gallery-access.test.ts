import { describe, expect, it, vi } from 'vitest';
import { createGallerySessionId } from '../src/lib/galleryAccess';

describe('Gallery tab-session IDs', () => {
  it('uses native UUID generation when available', () => {
    const randomUUID = vi.fn(() => '123e4567-e89b-42d3-a456-426614174000');

    expect(createGallerySessionId({ randomUUID })).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('builds an RFC 4122 v4 UUID when randomUUID is unavailable', () => {
    const sessionId = createGallerySessionId({
      getRandomValues: (bytes) => {
        bytes.fill(0);
        return bytes;
      },
    });

    expect(sessionId).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('omits the session ID when browser cryptography is unavailable', () => {
    expect(createGallerySessionId(undefined)).toBeUndefined();
    expect(createGallerySessionId({ getRandomValues: () => { throw new Error('unavailable'); } })).toBeUndefined();
  });
});
