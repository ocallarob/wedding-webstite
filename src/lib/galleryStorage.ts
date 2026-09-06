import {
  del,
  get,
  head,
  issueSignedToken,
  presignUrl,
  put,
  BlobNotFoundError,
  type HeadBlobResult,
  type IssuedSignedToken,
  type PutBlobResult,
} from '@vercel/blob';

// The only server-side Blob boundary for the gallery. Every store is private;
// nothing here ever returns a public/unsigned URL. Pathnames are provider-neutral
// (no host stored in Postgres) so a later storage-provider change stays a bounded
// swap of this one file plus an object copy.

export function galleryOriginalPath(id: string, filename: string): string {
  return `originals/${id}/${filename}`;
}

export function galleryDisplayPath(id: string, filename: string): string {
  return `display/${id}/${filename}`;
}

export function galleryThumbnailPath(id: string, filename: string): string {
  return `thumbnails/${id}/${filename}`;
}

export async function headGalleryBlob(pathname: string): Promise<HeadBlobResult | null> {
  try {
    return await head(pathname);
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

export async function readGalleryBlob(pathname: string): Promise<Buffer> {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200) {
    throw new Error(`Gallery blob not found: ${pathname}`);
  }
  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function streamGalleryBlob(pathname: string): Promise<{
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
}> {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200) {
    throw new Error(`Gallery blob not found: ${pathname}`);
  }
  return { stream: result.stream, contentType: result.blob.contentType, size: result.blob.size };
}

export async function putGalleryBlob(
  pathname: string,
  body: Buffer,
  options: { contentType: string; cacheControlMaxAge?: number },
): Promise<PutBlobResult> {
  return put(pathname, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: options.contentType,
    cacheControlMaxAge: options.cacheControlMaxAge,
  });
}

export async function deleteGalleryBlobs(pathnames: string[]): Promise<void> {
  const targets = pathnames.filter(Boolean);
  if (targets.length === 0) return;
  await del(targets);
}

const SIGNED_TOKEN_TTL_MS = 5 * 60_000;
const SIGNED_TOKEN_REISSUE_MARGIN_MS = 65_000;

let cachedSignedToken: IssuedSignedToken | null = null;

async function getCachedSignedToken(): Promise<IssuedSignedToken> {
  if (!cachedSignedToken || cachedSignedToken.validUntil - Date.now() < SIGNED_TOKEN_REISSUE_MARGIN_MS) {
    cachedSignedToken = await issueSignedToken({
      pathname: '*',
      operations: ['get'],
      validUntil: Date.now() + SIGNED_TOKEN_TTL_MS,
    });
  }
  return cachedSignedToken;
}

/**
 * Signs a short-lived (60s) GET URL for a display/thumbnail derivative only.
 * Never signs `originals/...` — those stay private to authenticated operator access.
 */
export async function presignGalleryDerivative(pathname: string): Promise<string> {
  if (!pathname.startsWith('display/') && !pathname.startsWith('thumbnails/')) {
    throw new Error(`Refusing to presign a non-derivative gallery pathname: ${pathname}`);
  }
  const token = await getCachedSignedToken();
  const { presignedUrl } = await presignUrl(token, {
    operation: 'get',
    pathname,
    access: 'private',
    validUntil: Date.now() + 60_000,
  });
  return presignedUrl;
}
