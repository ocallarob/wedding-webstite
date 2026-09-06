import { describe, expect, it } from 'vitest';
import { createGallerySessionToken, verifyGallerySessionToken } from '../src/lib/galleryAuth';
import { decideGalleryDelivery, classifyGalleryEmailError } from '../src/lib/galleryEmailDelivery';
import { buildGalleryEmailHtml, buildGalleryEmailSubject } from '../src/lib/galleryEmailHtml';
import { MAX_JPEG_BYTES } from '../src/lib/galleryConfig';
import {
  decodeGalleryCursor,
  encodeGalleryCursor,
  galleryDownloadDisposition,
  validateGalleryUploadIntent,
} from '../src/lib/galleryValidation';

const SESSION_SECRET = 'session-secret-that-is-longer-than-32-characters';
const ACCESS_TOKEN = 'access-token-that-is-longer-than-32-characters';
const PHOTO_ID = '11111111-1111-4111-8111-111111111111';

function validUpload(overrides: Record<string, unknown> = {}) {
  return {
    uploaderName: 'Anne & Brian',
    originalFilename: 'party.jpg',
    contentType: 'image/jpeg',
    rawBytes: 1024,
    sha256: 'a'.repeat(64),
    ...overrides,
  };
}

describe('gallery security and validation helpers', () => {
  it('signs gallery sessions with only the session secret and a UUID browser identity', () => {
    const token = createGallerySessionToken(SESSION_SECRET, PHOTO_ID);
    expect(verifyGallerySessionToken(token, SESSION_SECRET)).toEqual({ browserId: PHOTO_ID });
    expect(verifyGallerySessionToken(token, ACCESS_TOKEN)).toBeNull();
    expect(verifyGallerySessionToken(`${token}tampered`, SESSION_SECRET)).toBeNull();

    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')) as Record<string, unknown>;
    expect(payload).toEqual({ v: 1, b: PHOTO_ID });
    expect(JSON.stringify(payload)).not.toContain(SESSION_SECRET);
    expect(JSON.stringify(payload)).not.toContain(ACCESS_TOKEN);
    expect(verifyGallerySessionToken('not-a-session', SESSION_SECRET)).toBeNull();
  });

  it('accepts the exact JPEG byte ceiling and rejects one byte over it', () => {
    expect(validateGalleryUploadIntent(validUpload({ rawBytes: MAX_JPEG_BYTES })).ok).toBe(true);
    expect(validateGalleryUploadIntent(validUpload({ rawBytes: MAX_JPEG_BYTES + 1 })).ok).toBe(false);
  });

  it('rejects unsafe names, MIME types, and hashes', () => {
    for (const originalFilename of ['', 'photo.png', '../photo.jpg', 'photo\\name.jpg', 'photo\nname.jpg']) {
      expect(validateGalleryUploadIntent(validUpload({ originalFilename })).ok).toBe(false);
    }
    expect(validateGalleryUploadIntent(validUpload({ uploaderName: '   ' })).ok).toBe(false);
    expect(validateGalleryUploadIntent(validUpload({ uploaderName: 'x'.repeat(81) })).ok).toBe(false);
    expect(validateGalleryUploadIntent(validUpload({ contentType: 'image/png' })).ok).toBe(false);
    expect(validateGalleryUploadIntent(validUpload({ sha256: 'A'.repeat(64) })).ok).toBe(false);
    expect(validateGalleryUploadIntent(validUpload({ sha256: 'bad-hash' })).ok).toBe(false);
  });

  it('round-trips all cursor sort modes and preserves the UUID tie-breaker', () => {
    for (const sort of ['filename', 'uploaded'] as const) {
      for (const direction of ['asc', 'desc'] as const) {
        const cursor = { sort, direction, value: sort === 'uploaded' ? '2026-08-28T12:00:00.000Z' : 'photo.jpg', id: PHOTO_ID };
        expect(decodeGalleryCursor(encodeGalleryCursor(cursor), sort, direction)).toEqual(cursor);
      }
    }
    const encoded = encodeGalleryCursor({ sort: 'filename', direction: 'asc', value: 'photo.jpg', id: PHOTO_ID });
    expect(decodeGalleryCursor(encoded, 'uploaded', 'asc')).toBeNull();
    expect(decodeGalleryCursor(Buffer.from(JSON.stringify({ sort: 'filename', direction: 'asc', value: 4, id: PHOTO_ID })).toString('base64url'), 'filename', 'asc')).toBeNull();
    expect(decodeGalleryCursor(Buffer.from(JSON.stringify({ sort: 'filename', direction: 'asc', value: 'photo.jpg', id: 'not-uuid' })).toString('base64url'), 'filename', 'asc')).toBeNull();
    expect(
      decodeGalleryCursor(
        encodeGalleryCursor({ sort: 'uploaded', direction: 'asc', value: 'not-a-timestamp', id: PHOTO_ID }),
        'uploaded',
        'asc',
      ),
    ).toBeNull();
  });

  it('builds an injection-safe download disposition with the original filename', () => {
    const disposition = galleryDownloadDisposition('party\r\n" photo é.jpg');
    expect(disposition).not.toContain('\r');
    expect(disposition).not.toContain('\n');
    expect(disposition).toContain('filename*=UTF-8');
    expect(disposition).toContain('%C3%A9.jpg');
  });

  it('escapes gallery email values and puts the shared URL in the CTA', () => {
    const galleryUrl = 'https://alannah-rob.ie/gallery/access?token=abc';
    const html = buildGalleryEmailHtml('<Anne & Brian>', galleryUrl, 'https://alannah-rob.ie');
    expect(buildGalleryEmailSubject()).toBe('Our wedding photos — Alannah & Rob');
    expect(html).toContain('Dear &lt;Anne &amp; Brian&gt;');
    expect(html).toContain(`href="${galleryUrl}"`);
    expect(html).toContain('Open the gallery');
    expect(html).toContain('Thank you for celebrating with us. We have opened a private gallery where you can view, download and add photos from the wedding.');
  });
});

describe('gallery email delivery decisions', () => {
  const now = new Date('2026-09-06T12:00:00.000Z');
  const payloadHash = 'b'.repeat(64);
  const sending = { status: 'sending' as const, requestId: PHOTO_ID, payloadHash, startedAt: new Date(now.getTime() - 60_000) };

  it('resumes matching sends within 24 hours and never replaces stale or changed sends', () => {
    expect(decideGalleryDelivery(sending, payloadHash, now, false)).toEqual({ action: 'resume', requestId: PHOTO_ID });
    expect(decideGalleryDelivery({ ...sending, startedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000 - 1) }, payloadHash, now, true).action).toBe('unknown');
    expect(decideGalleryDelivery(sending, 'c'.repeat(64), now, true).action).toBe('unknown');
  });

  it('requires explicit resend confirmation after terminal or unknown outcomes', () => {
    expect(decideGalleryDelivery({ status: 'sent', requestId: PHOTO_ID, payloadHash, startedAt: now }, payloadHash, now, false).action).toBe('skip');
    expect(decideGalleryDelivery({ status: 'unknown', requestId: PHOTO_ID, payloadHash, startedAt: now }, payloadHash, now, false).action).toBe('skip');
    expect(decideGalleryDelivery({ status: 'failed', requestId: PHOTO_ID, payloadHash, startedAt: now }, payloadHash, now, false).action).toBe('skip');
    expect(decideGalleryDelivery({ status: 'sent', requestId: PHOTO_ID, payloadHash, startedAt: now }, payloadHash, now, true)).toEqual({ action: 'send' });
    expect(decideGalleryDelivery(null, payloadHash, now, false)).toEqual({ action: 'send' });
  });

  it('classifies only clearly rejected provider errors as terminal', () => {
    expect(classifyGalleryEmailError({ statusCode: 422, message: 'validation error' })).toBe('deterministic');
    expect(classifyGalleryEmailError({ name: 'daily_quota_exceeded' })).toBe('deterministic');
    expect(classifyGalleryEmailError(new Error('socket reset'))).toBe('ambiguous');
    expect(classifyGalleryEmailError({ statusCode: 503, message: 'provider unavailable' })).toBe('ambiguous');
  });
});
