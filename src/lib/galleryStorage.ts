import { issueSignedToken, presignUrl } from '@vercel/blob';
import { GALLERY_SIGNED_URL_TTL_SECONDS } from './galleryConfig';

type SignedUrlOptions = {
  download?: boolean;
  validUntil?: number;
};

export async function createGallerySignedUrl(
  storageKey: string,
  options: SignedUrlOptions = {},
): Promise<{ url: string; expiresAt: Date }> {
  const validUntil = options.validUntil ?? Date.now() + GALLERY_SIGNED_URL_TTL_SECONDS * 1000;
  const signedToken = await issueSignedToken({
    pathname: storageKey,
    operations: ['get'],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(signedToken, {
    access: 'private',
    operation: 'get',
    pathname: storageKey,
    validUntil,
    useCache: false,
  });

  if (!options.download) return { url: presignedUrl, expiresAt: new Date(validUntil) };

  const downloadUrl = new URL(presignedUrl);
  downloadUrl.searchParams.set('download', '1');
  return { url: downloadUrl.toString(), expiresAt: new Date(validUntil) };
}
