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

export const UPLOAD_PORTAL_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
export const UPLOAD_PORTAL_INIT_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 60,
} as const;
export const UPLOAD_PORTAL_RESEND_RATE_LIMIT = {
  limit: 1,
  windowSeconds: 60,
} as const;
export const GALLERY_ANNOUNCEMENT_INTERVAL_MS = 250;
export const GALLERY_ANNOUNCEMENT_CLAIM_TTL_SECONDS = 10 * 60;

export const UPLOAD_PORTAL_SESSION_TTL_SECONDS = 30 * 60;
export const UPLOAD_MAX_ASSETS_PER_VISIT = 20;
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
export const UPLOAD_PORTAL_CONTRIBUTION_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 60,
} as const;
export const UPLOAD_PORTAL_CALLBACK_RATE_LIMIT = {
  limit: 120,
  windowSeconds: 60,
} as const;

export const UPLOAD_PORTAL_CONFIRM_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 60,
} as const;

export type GalleryMediaType = 'photo' | 'video';

export function isGalleryToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,256}$/.test(value);
}

export function isUploadPortalToken(value: unknown): value is string {
  return typeof value === 'string' && /^up_[A-Za-z0-9_-]{43}$/.test(value);
}

export function mediaTypeForContentType(contentType: string): GalleryMediaType | null {
  if (contentType.startsWith('image/')) return 'photo';
  if (contentType.startsWith('video/')) return 'video';
  return null;
}
