import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sql } from '../src/lib/db';
import { getGalleryConfig, DISPLAY_RESERVED_BYTES, THUMBNAIL_RESERVED_BYTES } from '../src/lib/galleryConfig';
import { processGalleryPhoto } from '../src/lib/galleryProcessor';
import { reserveGalleryPhoto } from '../src/lib/galleryReservation';
import { deleteGalleryBlobs, galleryOriginalPath, putGalleryBlob } from '../src/lib/galleryStorage';
import { validateGalleryUploadIntent } from '../src/lib/galleryValidation';

const UPLOADER_NAME = 'Table Cameras';
const CONCURRENCY = 3;
const JPEG_EXTENSION = /\.jpe?g$/i;

type PreparedFile = {
  filePath: string;
  filename: string;
  buffer: Buffer;
  sha256: string;
  reservedBytes: number;
};

type FileReport = {
  filePath: string;
  filename: string;
  prepared?: PreparedFile;
  category: 'accepted' | 'invalid' | 'oversize' | 'duplicate_within_set' | 'duplicate_database';
  detail?: string;
};

type ImportResult = {
  file: PreparedFile;
  outcome: 'ready' | 'rejected' | 'failed' | 'pending' | 'duplicate' | 'storage_quota';
  detail?: string;
};

async function enumerateJpegs(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await enumerateJpegs(entryPath));
    } else if (entry.isFile() && JPEG_EXTENSION.test(entry.name)) {
      paths.push(entryPath);
    }
  }
  return paths.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function hasJpegSignature(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

async function databaseHashes(hashes: string[]): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();
  const rows = await sql`
    SELECT content_sha256
    FROM gallery_photos
    WHERE content_sha256 = ANY(${hashes}::text[])
  `;
  const hashRows = rows as { content_sha256: string }[];
  return new Set(hashRows.map((row) => String(row.content_sha256)));
}

async function readStorageState(): Promise<{ usedBytes: number; reservedBytes: number }> {
  const rows = await sql`
    SELECT used_bytes, reserved_bytes
    FROM gallery_storage_state
    WHERE id = 1
  `;
  if (!rows[0]) throw new Error('Gallery storage state is missing; run the database migration');
  const row = rows[0] as { used_bytes: number | string; reserved_bytes: number | string };
  return { usedBytes: Number(row.used_bytes), reservedBytes: Number(row.reserved_bytes) };
}

async function prepareFiles(filePaths: string[], databaseHashSet: Set<string>): Promise<FileReport[]> {
  const reports: FileReport[] = [];
  const seenHashes = new Set<string>();

  for (const filePath of filePaths) {
    const filename = path.basename(filePath);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch (error) {
      reports.push({ filePath, filename, category: 'invalid', detail: error instanceof Error ? error.message : 'Could not read file' });
      continue;
    }

    const sha256 = createHash('sha256').update(buffer).digest('hex');
    if (!hasJpegSignature(buffer)) {
      reports.push({ filePath, filename, category: 'invalid', detail: 'Missing JPEG SOI/marker signature' });
      continue;
    }
    if (buffer.byteLength > 20 * 1024 * 1024) {
      reports.push({ filePath, filename, category: 'oversize', detail: 'Exceeds the 20 MiB JPEG limit' });
      continue;
    }

    const validation = validateGalleryUploadIntent({
      uploaderName: UPLOADER_NAME,
      originalFilename: filename,
      contentType: 'image/jpeg',
      rawBytes: buffer.byteLength,
      sha256,
    });
    if (!validation.ok) {
      reports.push({ filePath, filename, category: 'invalid', detail: validation.error });
      continue;
    }
    if (seenHashes.has(sha256)) {
      reports.push({ filePath, filename, category: 'duplicate_within_set', detail: 'Byte-for-byte duplicate within this import set' });
      continue;
    }
    seenHashes.add(sha256);
    if (databaseHashSet.has(sha256)) {
      reports.push({ filePath, filename, category: 'duplicate_database', detail: 'Byte-for-byte duplicate already present in the gallery' });
      continue;
    }

    reports.push({
      filePath,
      filename,
      category: 'accepted',
      prepared: {
        filePath,
        filename,
        buffer,
        sha256,
        reservedBytes: buffer.byteLength + DISPLAY_RESERVED_BYTES + THUMBNAIL_RESERVED_BYTES,
      },
    });
  }
  return reports;
}

async function runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function runNext(): Promise<void> {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) return;
    await worker(items[index]);
    await runNext();
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, runNext));
}

async function applyFile(file: PreparedFile): Promise<ImportResult> {
  const reservation = await reserveGalleryPhoto({
    photoId: randomUUID(),
    browserId: null,
    source: 'table_cameras',
    uploaderName: UPLOADER_NAME,
    originalFilename: file.filename,
    sha256: file.sha256,
    rawBytes: file.buffer.byteLength,
    reservedBytes: file.reservedBytes,
  });

  if (reservation.outcome === 'duplicate') return { file, outcome: 'duplicate', detail: 'Duplicate detected during reservation' };
  if (reservation.outcome === 'storage_quota') return { file, outcome: 'storage_quota', detail: 'Storage limit reached during reservation' };
  if (reservation.outcome === 'browser_quota') return { file, outcome: 'storage_quota', detail: 'Browser quota unexpectedly applied to table-camera import' };
  if (reservation.outcome !== 'reserved' && reservation.outcome !== 'retry') {
    return { file, outcome: 'failed', detail: `Unexpected reservation outcome: ${reservation.outcome}` };
  }

  const originalPath = galleryOriginalPath(reservation.photoId, reservation.originalFilename);
  let recorded = false;

  try {
    await putGalleryBlob(originalPath, file.buffer, { contentType: 'image/jpeg' });
    await sql`
      SELECT record_gallery_upload(
        ${reservation.photoId}::uuid,
        ${reservation.generation}::integer,
        ${file.buffer.byteLength}::bigint,
        now()
      )
    `;
    recorded = true;
    await processGalleryPhoto(reservation.photoId, reservation.generation, file.buffer);

    const statusRows = await sql`
      SELECT status, failure_code
      FROM gallery_photos
      WHERE id = ${reservation.photoId}::uuid
    `;
    const status = statusRows[0] as { status: string; failure_code: string | null } | undefined;
    if (status?.status === 'ready') return { file, outcome: 'ready' };
    if (status?.status === 'rejected') return { file, outcome: 'rejected', detail: status.failure_code ?? 'Photo rejected' };
    if (status?.status === 'failed') return { file, outcome: 'failed', detail: status.failure_code ?? 'Photo processing failed' };
    return { file, outcome: 'pending', detail: 'Processing will be retried by the gallery queue' };
  } catch (error) {
    if (!recorded) {
      try {
        await deleteGalleryBlobs([originalPath]);
      } finally {
        await sql`SELECT release_gallery_photo(${reservation.photoId}::uuid, ${reservation.generation}::integer)`;
      }
      return { file, outcome: 'failed', detail: error instanceof Error ? error.message : 'Original upload failed' };
    }
    return { file, outcome: 'pending', detail: error instanceof Error ? error.message : 'Processing will be retried' };
  }
}

function printReport(reports: FileReport[], storage: { usedBytes: number; reservedBytes: number }, projectedBytes: number, warningBytes: number, limitBytes: number): void {
  const counts = {
    accepted: reports.filter((report) => report.category === 'accepted').length,
    invalid: reports.filter((report) => report.category === 'invalid').length,
    oversize: reports.filter((report) => report.category === 'oversize').length,
    duplicateWithinSet: reports.filter((report) => report.category === 'duplicate_within_set').length,
    duplicateDatabase: reports.filter((report) => report.category === 'duplicate_database').length,
  };
  console.log(`Uploader: ${UPLOADER_NAME}`);
  console.log(`Accepted: ${counts.accepted}`);
  console.log(`Invalid: ${counts.invalid}`);
  console.log(`Oversize: ${counts.oversize}`);
  console.log(`Duplicate within set: ${counts.duplicateWithinSet}`);
  console.log(`Duplicate in database: ${counts.duplicateDatabase}`);
  console.log(`Current used + reserved: ${storage.usedBytes + storage.reservedBytes} bytes`);
  console.log(`Projected reservation: ${projectedBytes} bytes`);
  console.log(`Projected total: ${storage.usedBytes + storage.reservedBytes + projectedBytes} bytes`);
  console.log(`Warning crossed: ${storage.usedBytes + storage.reservedBytes + projectedBytes >= warningBytes ? 'yes' : 'no'}`);
  console.log(`Hard limit crossed: ${storage.usedBytes + storage.reservedBytes + projectedBytes > limitBytes ? 'yes' : 'no'}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const directories = args.filter((arg) => arg !== '--apply');
  if (directories.length !== 1) throw new Error('Usage: pnpm gallery:import <directory> [--apply]');

  const root = path.resolve(directories[0]);
  const rootStat = await fs.stat(root);
  if (!rootStat.isDirectory()) throw new Error(`${root} is not a directory`);
  const config = getGalleryConfig();
  if (apply && !process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN is required with --apply');

  const filePaths = await enumerateJpegs(root);
  const hashes = [] as string[];
  for (const filePath of filePaths) {
    try {
      const buffer = await fs.readFile(filePath);
      if (buffer.byteLength <= 20 * 1024 * 1024 && hasJpegSignature(buffer)) hashes.push(createHash('sha256').update(buffer).digest('hex'));
    } catch {
      // The preparation pass reports the readable error per file.
    }
  }
  const databaseHashSet = await databaseHashes(hashes);
  const reports = await prepareFiles(filePaths, databaseHashSet);
  const storage = await readStorageState();
  const accepted = reports.flatMap((report) => report.prepared ? [report.prepared] : []);
  const projectedBytes = accepted.reduce((sum, file) => sum + file.reservedBytes, 0);
  printReport(reports, storage, projectedBytes, config.storageWarningBytes, config.storageLimitBytes);

  for (const report of reports.filter((entry) => entry.category !== 'accepted')) {
    console.log(`${report.category}: ${path.relative(root, report.filePath)}${report.detail ? ` — ${report.detail}` : ''}`);
  }
  if (!apply) return;

  const results: ImportResult[] = [];
  await runWithConcurrency(accepted, async (file) => {
    try {
      results.push(await applyFile(file));
    } catch (error) {
      results.push({ file, outcome: 'failed', detail: error instanceof Error ? error.message : 'Import failed before reservation completed' });
    }
  });
  const resultCounts = results.reduce<Record<string, number>>((counts, result) => {
    counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
    return counts;
  }, {});
  console.log(`Apply results: ${JSON.stringify(resultCounts)}`);
  if (results.some((result) => result.outcome === 'pending' || result.outcome === 'failed')) {
    process.exitCode = 1;
  }
  for (const result of results.filter((entry) => entry.outcome !== 'ready')) {
    console.log(`${result.outcome}: ${path.relative(root, result.file.filePath)}${result.detail ? ` — ${result.detail}` : ''}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
