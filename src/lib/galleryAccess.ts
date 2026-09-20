import { isGalleryToken } from './galleryConfig';

export const GALLERY_TOKEN_STORAGE_KEY = 'wedding-gallery-token';
export const GALLERY_ACCESS_EVENT = 'wedding-gallery-access-changed';

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
