// Single server-side configuration boundary for the guest photo gallery.
// Every value is read lazily (never at import time) so unrelated routes and
// the Next.js build never throw because gallery env vars are unset.

export const MAX_JPEG_BYTES = 20 * 1024 * 1024;
export const BROWSER_RAW_LIMIT_BYTES = 500 * 1024 * 1024;
export const DISPLAY_RESERVED_BYTES = 8 * 1024 * 1024;
export const THUMBNAIL_RESERVED_BYTES = 512 * 1024;
export const GALLERY_PAGE_SIZE = 30;
export const UPLOAD_URL_TTL_SECONDS = 900;
export const MEDIA_URL_TTL_SECONDS = 60;
export const GALLERY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

const DEFAULT_STORAGE_WARNING_BYTES = 25 * 1024 ** 3;
const DEFAULT_STORAGE_LIMIT_BYTES = 30 * 1024 ** 3;

const MIN_SECRET_LENGTH = 32;

export type GalleryConfig = {
  accessToken: string;
  sessionSecret: string;
  alertEmail: string;
  storageWarningBytes: number;
  storageLimitBytes: number;
};

function parsePositiveIntEnv(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

/**
 * Fails closed: throws when required gallery configuration is missing or invalid.
 * Callers (routes, layout) must catch/let this propagate into a 503 rather than
 * silently granting access.
 */
export function getGalleryConfig(): GalleryConfig {
  const accessToken = process.env.GALLERY_ACCESS_TOKEN;
  const sessionSecret = process.env.GALLERY_SESSION_SECRET;
  const alertEmail = process.env.GALLERY_ALERT_EMAIL;

  if (!accessToken || accessToken.length < MIN_SECRET_LENGTH) {
    throw new Error(`GALLERY_ACCESS_TOKEN must be set to at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (!sessionSecret || sessionSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`GALLERY_SESSION_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (accessToken === sessionSecret) {
    throw new Error('GALLERY_ACCESS_TOKEN and GALLERY_SESSION_SECRET must be distinct');
  }
  if (!alertEmail || alertEmail.trim().length === 0) {
    throw new Error('GALLERY_ALERT_EMAIL must be set');
  }

  const storageWarningBytes = parsePositiveIntEnv(
    'GALLERY_STORAGE_WARNING_BYTES',
    process.env.GALLERY_STORAGE_WARNING_BYTES,
    DEFAULT_STORAGE_WARNING_BYTES,
  );
  const storageLimitBytes = parsePositiveIntEnv(
    'GALLERY_STORAGE_LIMIT_BYTES',
    process.env.GALLERY_STORAGE_LIMIT_BYTES,
    DEFAULT_STORAGE_LIMIT_BYTES,
  );
  if (storageWarningBytes >= storageLimitBytes) {
    throw new Error('GALLERY_STORAGE_WARNING_BYTES must be less than GALLERY_STORAGE_LIMIT_BYTES');
  }

  return { accessToken, sessionSecret, alertEmail, storageWarningBytes, storageLimitBytes };
}

export type GalleryStorageConfig = GalleryConfig & {
  blobStoreId: string;
  blobWebhookPublicKey: string;
};

export function getGalleryStorageConfig(): GalleryStorageConfig {
  const base = getGalleryConfig();
  const blobStoreId = process.env.BLOB_STORE_ID;
  const blobWebhookPublicKey = process.env.BLOB_WEBHOOK_PUBLIC_KEY;

  if (!blobStoreId) throw new Error('BLOB_STORE_ID is not set');
  if (!blobWebhookPublicKey) throw new Error('BLOB_WEBHOOK_PUBLIC_KEY is not set');

  return { ...base, blobStoreId, blobWebhookPublicKey };
}

export type GalleryRecoveryConfig = {
  cronSecret: string;
};

export function getGalleryRecoveryConfig(): GalleryRecoveryConfig {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`CRON_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters`);
  }
  return { cronSecret };
}
