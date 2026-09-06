import { describe, expect, it } from 'vitest';
import sharp, { type Exif } from 'sharp';
import {
  buildDerivatives,
  GalleryInvalidJpegError,
  GalleryPixelLimitError,
} from '../src/lib/galleryProcessor';
import { isGalleryQueueMessage } from '../src/lib/galleryQueue';

const PHOTO_ID = '11111111-1111-4111-8111-111111111111';

it('builds oriented, metadata-free derivatives within their reserved bounds', async () => {
  const exif: Exif = {
    IFD0: { Make: 'TestCam' },
    IFD3: {
      GPSLatitudeRef: 'N',
      GPSLatitude: '53/1 21/1 0/1',
      GPSLongitudeRef: 'W',
      GPSLongitude: '7/1 38/1 0/1',
    },
  };
  const source = await sharp({
    create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .withExif(exif)
    .withMetadata({ orientation: 6 })
    .toBuffer();

  // Guard against a false-positive: confirm the source actually carries EXIF
  // before asserting below that the derivatives strip it.
  const sourceMetadata = await sharp(source).metadata();
  expect(sourceMetadata.exif).toBeInstanceOf(Buffer);

  const derivatives = await buildDerivatives(source);
  const displayMetadata = await sharp(derivatives.display).metadata();
  const thumbnailMetadata = await sharp(derivatives.thumbnail).metadata();

  expect(displayMetadata.format).toBe('jpeg');
  expect(displayMetadata.width).toBeLessThan(displayMetadata.height ?? 0);
  expect(Math.max(displayMetadata.width ?? 0, displayMetadata.height ?? 0)).toBeLessThanOrEqual(2048);
  expect(Math.max(thumbnailMetadata.width ?? 0, thumbnailMetadata.height ?? 0)).toBeLessThanOrEqual(512);
  expect(displayMetadata.exif).toBeUndefined();
  expect(displayMetadata.orientation).toBeUndefined();
  expect(thumbnailMetadata.exif).toBeUndefined();
  expect(derivatives.display.byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
  expect(derivatives.thumbnail.byteLength).toBeLessThanOrEqual(512 * 1024);
}, 30_000);

it('returns permanent safe errors for malformed, wrong-format, and over-pixel input', async () => {
  await expect(buildDerivatives(Buffer.from('not a jpeg'))).rejects.toBeInstanceOf(GalleryInvalidJpegError);
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
  await expect(buildDerivatives(png)).rejects.toBeInstanceOf(GalleryInvalidJpegError);

  const huge = await sharp({ create: { width: 11_000, height: 11_000, channels: 3, background: { r: 1, g: 1, b: 1 } } }).jpeg().toBuffer();
  await expect(buildDerivatives(huge)).rejects.toBeInstanceOf(GalleryPixelLimitError);
}, 30_000);

it('accepts only a UUID plus a positive integer generation as a queue message', () => {
  expect(isGalleryQueueMessage({ photoId: PHOTO_ID, generation: 1 })).toBe(true);
  expect(isGalleryQueueMessage({ photoId: PHOTO_ID, generation: 0 })).toBe(false);
  expect(isGalleryQueueMessage({ photoId: PHOTO_ID, generation: 1.5 })).toBe(false);
  expect(isGalleryQueueMessage({ photoId: 'not-a-uuid', generation: 1 })).toBe(false);
  expect(isGalleryQueueMessage({ photoId: PHOTO_ID, generation: '1' })).toBe(false);
  expect(isGalleryQueueMessage({ photoId: PHOTO_ID, generation: 1, extra: true })).toBe(true);
});
