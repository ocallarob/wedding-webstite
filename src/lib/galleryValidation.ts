import { MAX_JPEG_BYTES } from './galleryConfig';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const JPEG_EXTENSION_PATTERN = /\.jpe?g$/i;
const PATH_OR_CONTROL_CHAR_PATTERN = /[\\/\x00-\x1f]/;

export type GalleryUploadIntent = {
  uploaderName: string;
  originalFilename: string;
  contentType: 'image/jpeg';
  rawBytes: number;
  sha256: string;
};

export function validateGalleryUploadIntent(value: unknown):
  | { ok: true; intent: GalleryUploadIntent }
  | { ok: false; error: string } {
  if (!value || typeof value !== 'object') return { ok: false, error: 'Request body must be a JSON object' };

  const { uploaderName, originalFilename, contentType, rawBytes, sha256 } = value as Record<string, unknown>;

  const trimmedName = typeof uploaderName === 'string' ? uploaderName.trim() : '';
  if (trimmedName.length < 1 || trimmedName.length > 80) {
    return { ok: false, error: '"uploaderName" must be between 1 and 80 characters' };
  }

  if (typeof originalFilename !== 'string' || originalFilename.length < 1 || originalFilename.length > 255) {
    return { ok: false, error: '"originalFilename" must be between 1 and 255 characters' };
  }
  if (PATH_OR_CONTROL_CHAR_PATTERN.test(originalFilename)) {
    return { ok: false, error: '"originalFilename" must not contain path separators or control characters' };
  }
  if (!JPEG_EXTENSION_PATTERN.test(originalFilename)) {
    return { ok: false, error: '"originalFilename" must end in .jpg or .jpeg' };
  }

  if (contentType !== 'image/jpeg') {
    return { ok: false, error: '"contentType" must be image/jpeg' };
  }

  if (typeof rawBytes !== 'number' || !Number.isInteger(rawBytes) || rawBytes < 1 || rawBytes > MAX_JPEG_BYTES) {
    return { ok: false, error: `"rawBytes" must be an integer between 1 and ${MAX_JPEG_BYTES}` };
  }

  if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) {
    return { ok: false, error: '"sha256" must be a lowercase 64-character hex string' };
  }

  return {
    ok: true,
    intent: { uploaderName: trimmedName, originalFilename, contentType: 'image/jpeg', rawBytes, sha256 },
  };
}

export type GallerySort = 'filename' | 'uploaded';
export type GalleryDirection = 'asc' | 'desc';

export type GalleryCursor = {
  sort: GallerySort;
  direction: GalleryDirection;
  value: string;
  id: string;
};

const MAX_CURSOR_LENGTH = 512;

export function encodeGalleryCursor(cursor: GalleryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Strictly decodes an opaque cursor and rejects one issued for a different
 * sort/direction than the current request — a stale cursor from before the
 * guest changed their sort choice must never be silently reinterpreted.
 */
export function decodeGalleryCursor(
  cursor: string,
  expectedSort: GallerySort,
  expectedDirection: GalleryDirection,
): GalleryCursor | null {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const { sort, direction, value, id } = parsed as Record<string, unknown>;
  if (sort !== expectedSort || direction !== expectedDirection) return null;
  if (typeof value !== 'string' || value.length === 0) return null;
  if (sort === 'filename' && value !== value.toLowerCase()) return null;
  if (sort === 'uploaded' && !Number.isFinite(Date.parse(value))) return null;
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return null;

  return { sort: expectedSort, direction: expectedDirection, value, id };
}

/** RFC 5987 `attr-char` excludes `* ' ( )`, which `encodeURIComponent` leaves unescaped. */
function encodeRfc5987ValueChars(input: string): string {
  return encodeURIComponent(input)
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A');
}

/**
 * Builds a `Content-Disposition` header value that cannot be used for header
 * injection (CR/LF/quotes stripped from the ASCII fallback) while still
 * preserving the guest's original filename for clients that support RFC 5987.
 */
export function galleryDownloadDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[\r\n"]/g, '').replace(/[^\x20-\x7e]/g, '_') || 'photo.jpg';
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987ValueChars(filename)}`;
}
