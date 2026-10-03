import { createHash, randomBytes } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { del, put } from '@vercel/blob';
import sharp from 'sharp';
import { sql } from '../src/lib/db';
import { isGalleryPhotoSource, type GalleryPhotoSource } from '../src/lib/galleryConfig';
import { validateUploadAsset } from '../src/lib/uploadValidation';

const CONTENT_TYPES: Record<string, string> = {
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

type Options = {
  householdId: string | null;
  paths: string[];
  source: GalleryPhotoSource;
};

type ImportResult =
  | { status: 'uploaded'; filePath: string; assetKey: string; storagePath: string }
  | { status: 'existing'; filePath: string; assetKey: string }
  | { status: 'skipped'; filePath: string; reason: string }
  | { status: 'failed'; filePath: string; reason: string };

function printUsage(): void {
  console.log(`Usage: pnpm gallery:upload -- --source <professional|guest> [options] <file-or-directory> [...]

Options:
  --source <value>         Required: professional or guest.
  --household-id <uuid>    Associate imported assets with a household.

CLI-imported assets are published immediately. Directories are scanned recursively. Unsupported files are skipped.`);
}

function parseOptions(args: string[]): Options {
  const paths: string[] = [];
  let householdId: string | null = null;
  let source: GalleryPhotoSource | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (arg === '--source' || arg.startsWith('--source=')) {
      const value = arg === '--source' ? args[index + 1] : arg.slice('--source='.length);
      if (!isGalleryPhotoSource(value)) throw new Error('--source must be professional or guest.');
      source = value;
      if (arg === '--source') index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--household-id') {
      const value = args[index + 1];
      if (!value) throw new Error('--household-id requires a UUID.');
      householdId = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--household-id=')) {
      householdId = arg.slice('--household-id='.length) || null;
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    paths.push(arg);
  }

  if (paths.length === 0) throw new Error('Provide at least one file or directory.');
  if (!source) throw new Error('--source is required (professional or guest).');
  if (householdId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(householdId)) {
    throw new Error('--household-id must be a UUID.');
  }

  return { householdId, paths, source };
}

async function collectFiles(inputPath: string): Promise<string[]> {
  const absolutePath = resolve(inputPath);
  const inputStats = await stat(absolutePath);
  if (inputStats.isFile()) return [absolutePath];
  if (!inputStats.isDirectory()) return [];

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = resolve(absolutePath, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function safeName(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160);
  return safe || 'asset';
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}
async function createGalleryThumbnail(pathname: string, body: Buffer): Promise<string | null> {
  try {
    const thumbnail = await sharp(body)
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    const blob = await put(pathname, thumbnail, {
      access: 'private',
      allowOverwrite: true,
      contentType: 'image/webp',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.pathname;
  } catch (error) {
    console.warn(`Using the original for preview of ${pathname}: ${errorMessage(error)}`);
    return null;
  }
}

async function updateExistingGalleryAsset(id: string, source: GalleryPhotoSource, thumbnailKey: string | null): Promise<void> {
  await sql`
    UPDATE gallery_assets
    SET photo_source = ${source},
        thumbnail_key = COALESCE(thumbnail_key, ${thumbnailKey}),
        moderation_status = CASE
          WHEN moderation_status = 'pending' THEN 'published'
          ELSE moderation_status
        END,
        published_at = CASE
          WHEN moderation_status = 'pending' THEN COALESCE(published_at, now())
          ELSE published_at
        END
    WHERE id = ${id}
  `;
}

async function importAsset(filePath: string, options: Options): Promise<ImportResult> {
  const displayName = basename(filePath);
  const contentType = CONTENT_TYPES[extname(displayName).toLowerCase()];
  if (!contentType) return { status: 'skipped', filePath, reason: 'unsupported media extension' };

  try {
    const fileStats = await stat(filePath);
    const validation = validateUploadAsset({ displayName, contentType, sizeBytes: fileStats.size });
    if (!validation.ok) return { status: 'skipped', filePath, reason: validation.message };

    const body = await readFile(filePath);
    const digest = createHash('sha256').update(body).digest('hex');
    const storagePath = `cli-imports/${digest}-${safeName(displayName)}`;
    const thumbnailPath = `${storagePath}.preview.webp`;
    const existing = await sql`
      SELECT id, public_key, photo_source, thumbnail_key, moderation_status
      FROM gallery_assets
      WHERE storage_key = ${storagePath}
      LIMIT 1
    `;
    if (existing[0]) {
      const existingThumbnailKey = existing[0].thumbnail_key ? String(existing[0].thumbnail_key) : null;
      const thumbnailKey = validation.asset.mediaType === 'photo' && !existingThumbnailKey
        ? await createGalleryThumbnail(thumbnailPath, body)
        : existingThumbnailKey;
      if (
        existing[0].photo_source !== options.source
        || thumbnailKey !== existingThumbnailKey
        || existing[0].moderation_status === 'pending'
      ) {
        await updateExistingGalleryAsset(String(existing[0].id), options.source, thumbnailKey);
      }
      return { status: 'existing', filePath, assetKey: String(existing[0].public_key) };
    }

    const blob = await put(storagePath, body, {
      access: 'private',
      allowOverwrite: false,
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const thumbnailKey = validation.asset.mediaType === 'photo'
      ? await createGalleryThumbnail(thumbnailPath, body)
      : null;
    const publicKey = `asset_${randomBytes(24).toString('base64url')}`;
    const moderationStatus = 'published';
    const publishedAt = new Date().toISOString();

    try {
      const inserted = await sql`
        INSERT INTO gallery_assets (
          public_key,
          household_id,
          storage_key,
          thumbnail_key,
          media_type,
          photo_source,
          content_type,
          size_bytes,
          display_name,
          moderation_status,
          published_at
        )
        VALUES (
          ${publicKey},
          ${options.householdId},
          ${blob.pathname},
          ${thumbnailKey},
          ${validation.asset.mediaType},
          ${options.source},
          ${validation.asset.contentType},
          ${validation.asset.sizeBytes},
          ${validation.asset.displayName},
          ${moderationStatus},
          ${publishedAt}
        )
        ON CONFLICT (storage_key) DO NOTHING
        RETURNING public_key
      `;
      if (inserted.length === 0) {
        const duplicate = await sql`
          SELECT id, public_key
          FROM gallery_assets
          WHERE storage_key = ${blob.pathname}
          LIMIT 1
        `;
        if (duplicate[0]) {
          await updateExistingGalleryAsset(String(duplicate[0].id), options.source, thumbnailKey);
        }
        return { status: 'existing', filePath, assetKey: String(duplicate[0]?.public_key ?? publicKey) };
      }
    } catch (error) {
      await Promise.allSettled([
        del(blob.pathname, { token: process.env.BLOB_READ_WRITE_TOKEN }),
        ...(thumbnailKey ? [del(thumbnailKey, { token: process.env.BLOB_READ_WRITE_TOKEN })] : []),
      ]);
      throw error;
    }

    return { status: 'uploaded', filePath, assetKey: publicKey, storagePath: blob.pathname };
  } catch (error) {
    return { status: 'failed', filePath, reason: errorMessage(error) };
  }
}

async function main(): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error('Configure BLOB_READ_WRITE_TOKEN or VERCEL_OIDC_TOKEN before uploading.');
  }

  const options = parseOptions(process.argv.slice(2));
  if (!process.env.BLOB_READ_WRITE_TOKEN && process.env.VERCEL_OIDC_TOKEN && !process.env.BLOB_STORE_ID) {
    throw new Error('BLOB_STORE_ID is required when uploading with VERCEL_OIDC_TOKEN.');
  }
  const files = (await Promise.all(options.paths.map(collectFiles))).flat();
  const uniqueFiles = [...new Set(files)];
  if (uniqueFiles.length === 0) throw new Error('No files found.');

  const results: ImportResult[] = [];
  for (const filePath of uniqueFiles) {
    const result = await importAsset(filePath, options);
    results.push(result);
    if (result.status === 'uploaded') console.log(`Uploaded ${result.filePath} -> ${result.assetKey}`);
    if (result.status === 'existing') console.log(`Already imported ${result.filePath} -> ${result.assetKey}`);
    if (result.status === 'skipped') console.log(`Skipped ${result.filePath}: ${result.reason}`);
    if (result.status === 'failed') console.error(`Failed ${result.filePath}: ${result.reason}`);
  }

  const uploaded = results.filter((result) => result.status === 'uploaded').length;
  const existing = results.filter((result) => result.status === 'existing').length;
  const skipped = results.filter((result) => result.status === 'skipped').length;
  const failed = results.filter((result) => result.status === 'failed').length;
  console.log(`Summary: ${uploaded} uploaded, ${existing} already present, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(errorMessage(error));
  printUsage();
  process.exitCode = 1;
});
