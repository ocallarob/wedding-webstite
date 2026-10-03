export const GALLERY_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;
export const GALLERY_SIGNED_URL_TTL_SECONDS = 5 * 60;

export const GALLERY_LIST_RATE_LIMIT = {
  limit: 60,
  windowSeconds: 60,
} as const;

export const GALLERY_URL_RATE_LIMIT = {
  limit: 120,
  windowSeconds: 60,
} as const;

export const GALLERY_ANNOUNCEMENT_INTERVAL_MS = 250;
export const GALLERY_ANNOUNCEMENT_CLAIM_TTL_SECONDS = 10 * 60;

export const UPLOAD_MAX_ASSET_BYTES = 100 * 1024 * 1024;
export const UPLOAD_ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export type GalleryMediaType = 'photo' | 'video';
export type GalleryPhotoSource = 'professional' | 'guest';
export type GallerySourceFilter = 'all' | GalleryPhotoSource;

export function isGalleryPhotoSource(value: unknown): value is GalleryPhotoSource {
  return value === 'professional' || value === 'guest';
}

export function isGallerySourceFilter(value: unknown): value is GallerySourceFilter {
  return value === 'all' || isGalleryPhotoSource(value);
}

export function isGalleryToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,256}$/.test(value);
}
export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}


export function mediaTypeForContentType(contentType: string): GalleryMediaType | null {
  if (contentType.startsWith('image/')) return 'photo';
  if (contentType.startsWith('video/')) return 'video';
  return null;
}
