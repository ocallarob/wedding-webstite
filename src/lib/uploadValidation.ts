import {
  UPLOAD_ALLOWED_CONTENT_TYPES,
  UPLOAD_MAX_ASSET_BYTES,
  mediaTypeForContentType,
  type GalleryMediaType,
} from './galleryConfig';

export type ValidatedUploadAsset = {
  displayName: string;
  contentType: string;
  sizeBytes: number;
  mediaType: GalleryMediaType;
};

export type UploadAssetValidation =
  | { ok: true; asset: ValidatedUploadAsset }
  | { ok: false; message: string };
const displayNamePattern = /[\u0000-\u001f\u007f]/g;

export function validateUploadAsset(input: {
  displayName: unknown;
  contentType: unknown;
  sizeBytes: unknown;
}): UploadAssetValidation {
  if (typeof input.displayName !== 'string' || typeof input.contentType !== 'string') {
    return { ok: false, message: 'Asset metadata is invalid.' };
  }

  const displayName = input.displayName.replace(/\\/g, '/').split('/').pop()?.replace(displayNamePattern, '').trim() ?? '';
  const contentType = input.contentType.trim().toLowerCase();
  const sizeBytes = input.sizeBytes;

  if (!displayName || displayName.length > 255) {
    return { ok: false, message: 'Give each asset a display name of 1 to 255 characters.' };
  }
  if (!UPLOAD_ALLOWED_CONTENT_TYPES.includes(contentType as (typeof UPLOAD_ALLOWED_CONTENT_TYPES)[number]) || !mediaTypeForContentType(contentType)) {
    return { ok: false, message: 'This media type is not supported. Choose a photograph or video.' };
  }
  if (typeof sizeBytes !== 'number' || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, message: 'The asset size is invalid.' };
  }
  if (sizeBytes > UPLOAD_MAX_ASSET_BYTES) {
    return { ok: false, message: `Each asset must be ${Math.round(UPLOAD_MAX_ASSET_BYTES / (1024 * 1024))} MB or smaller.` };
  }

  return {
    ok: true,
    asset: {
      displayName,
      contentType,
      sizeBytes,
      mediaType: mediaTypeForContentType(contentType)!,
    },
  };
}

export function isUploadPathname(pathname: unknown): pathname is string {
  return typeof pathname === 'string'
    && /^guest-submissions\/[A-Za-z0-9_-]{16,80}\/[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(pathname);
}
