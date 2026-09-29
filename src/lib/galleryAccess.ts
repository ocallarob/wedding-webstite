import { isGalleryToken } from './galleryConfig';

export const GALLERY_TOKEN_STORAGE_KEY = 'wedding-gallery-token';
export const GALLERY_ACCESS_EVENT = 'wedding-gallery-access-changed';
type GalleryCrypto = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

export function createGallerySessionId(crypto: GalleryCrypto | undefined): string | undefined {
  if (typeof crypto?.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall back to getRandomValues when native UUID generation is unavailable.
    }
  }

  try {
    if (!crypto?.getRandomValues) return undefined;

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return undefined;
  }
}


export function getStoredGalleryToken(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const token = window.localStorage.getItem(GALLERY_TOKEN_STORAGE_KEY);
    return isGalleryToken(token) ? token : null;
  } catch {
    return null;
  }
}

export function storeGalleryToken(token: string): void {
  if (typeof window === 'undefined' || !isGalleryToken(token)) return;

  try {
    window.localStorage.setItem(GALLERY_TOKEN_STORAGE_KEY, token);
    window.dispatchEvent(new Event(GALLERY_ACCESS_EVENT));
  } catch {
    // Gallery access still works for the current link when storage is unavailable.
  }
}

export function clearGalleryToken(expectedToken?: string): void {
  if (typeof window === 'undefined') return;

  try {
    if (expectedToken && window.localStorage.getItem(GALLERY_TOKEN_STORAGE_KEY) !== expectedToken) return;
    window.localStorage.removeItem(GALLERY_TOKEN_STORAGE_KEY);
    window.dispatchEvent(new Event(GALLERY_ACCESS_EVENT));
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
