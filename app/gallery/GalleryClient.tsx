'use client';

import { uploadPresigned } from '@vercel/blob/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type UploadStatus =
  | 'hashing'
  | 'reserving'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'duplicate'
  | 'rejected'
  | 'failed';

type UploadItem = {
  clientKey: string;
  file: File;
  originalFilename: string;
  status: UploadStatus;
  progressPercent: number;
  photoId?: string;
  generation?: number;
  sha256?: string;
  message?: string;
  processingStartedAt?: number;
};

type PhotoSummary = {
  id: string;
  originalFilename: string;
  uploaderName: string;
  uploadedAt: string;
  width: number | null;
  height: number | null;
};

type PhotosResponse = { photos: PhotoSummary[]; nextCursor: string | null };
type UploadStatusResponse = { uploads: { photoId: string; status: string; failureReason: string | null }[] };

type SortOption = { sort: 'filename' | 'uploaded'; direction: 'asc' | 'desc'; label: string };

const SORT_OPTIONS: SortOption[] = [
  { sort: 'filename', direction: 'asc', label: 'Filename (A–Z)' },
  { sort: 'filename', direction: 'desc', label: 'Filename (Z–A)' },
  { sort: 'uploaded', direction: 'desc', label: 'Newest uploads first' },
  { sort: 'uploaded', direction: 'asc', label: 'Oldest uploads first' },
];

const MAX_FILES_PER_SELECTION = 100;
const MAX_CONCURRENT_UPLOADS = 3;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const STATUS_LABELS: Record<UploadStatus, string> = {
  hashing: 'Checking…',
  reserving: 'Reserving…',
  uploading: 'Uploading…',
  processing: 'Processing…',
  ready: 'Ready ✓',
  duplicate: 'Already uploaded',
  rejected: 'Rejected',
  failed: 'Failed',
};

const FAILURE_MESSAGES: Record<string, string> = {
  invalid_jpeg: 'This file is not a valid JPEG photo.',
  size_mismatch: 'The upload did not match the expected file size.',
  hash_mismatch: 'The upload did not match the expected file contents.',
  pixel_limit: 'This photo is too large to process.',
  derivative_too_large: 'This photo could not be resized within the size limit.',
  processing_failed: 'Something went wrong processing this photo.',
};

function describeFailure(code: string | null): string {
  return (code && FAILURE_MESSAGES[code]) || 'This photo could not be processed.';
}

function statusClassName(status: UploadStatus): string {
  if (status === 'ready') return 'text-sage font-medium';
  if (status === 'failed' || status === 'rejected') return 'text-red-700 font-medium';
  if (status === 'duplicate') return 'text-mauve font-medium';
  return 'text-muted';
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function validateFileClientSide(file: File, maxJpegBytes: number): string | null {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.jpg') && !lowerName.endsWith('.jpeg')) return 'Only .jpg/.jpeg files are supported';
  if (file.type && file.type !== 'image/jpeg') return 'Only JPEG images are supported';
  if (file.size < 1) return 'File is empty';
  if (file.size > maxJpegBytes) return `File exceeds the ${formatBytes(maxJpegBytes)} limit`;
  return null;
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function runWithConcurrencyLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function runNext(): Promise<void> {
    const current = cursor;
    cursor += 1;
    if (current >= items.length) return;
    await worker(items[current]);
    await runNext();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
}

async function requestPhotosPage(option: SortOption, cursor: string | null): Promise<PhotosResponse> {
  const params = new URLSearchParams({ sort: option.sort, direction: option.direction });
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(`/api/gallery/photos?${params.toString()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to load photos');
  return (await response.json()) as PhotosResponse;
}

export function GalleryClient({ maxJpegBytes }: { maxJpegBytes: number }) {
  const [uploaderName, setUploaderName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Map<string, UploadItem>>(new Map());
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;

  const [sortIndex, setSortIndex] = useState(0);
  const currentSort = SORT_OPTIONS[sortIndex];
  const [photos, setPhotos] = useState<PhotoSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const pageRequestVersionRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const updateUpload = useCallback((clientKey: string, patch: Partial<UploadItem>) => {
    setUploads((prev) => {
      const existing = prev.get(clientKey);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(clientKey, { ...existing, ...patch });
      return next;
    });
  }, []);

  const loadFirstPage = useCallback(() => {
    const requestVersion = ++pageRequestVersionRef.current;
    loadingMoreRef.current = false;
    setPhotos([]);
    setNextCursor(null);
    setInitialLoadDone(false);
    setGridLoading(true);
    setGridError(null);
    requestPhotosPage(currentSort, null)
      .then((data) => {
        if (requestVersion !== pageRequestVersionRef.current) return;
        setPhotos(data.photos);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {
        if (requestVersion === pageRequestVersionRef.current) setGridError('Could not load photos. Please try again.');
      })
      .finally(() => {
        if (requestVersion !== pageRequestVersionRef.current) return;
        setGridLoading(false);
        setInitialLoadDone(true);
      });
  }, [currentSort]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const loadFirstPageRef = useRef(loadFirstPage);
  useEffect(() => {
    loadFirstPageRef.current = loadFirstPage;
  }, [loadFirstPage]);

  const loadMore = useCallback(async (): Promise<boolean> => {
    if (loadingMoreRef.current || !nextCursor) return false;
    const requestVersion = pageRequestVersionRef.current;
    const cursor = nextCursor;
    loadingMoreRef.current = true;
    setGridLoading(true);
    try {
      const data = await requestPhotosPage(currentSort, cursor);
      if (requestVersion !== pageRequestVersionRef.current) return false;
      setPhotos((prev) => [...prev, ...data.photos]);
      setNextCursor(data.nextCursor);
      return data.photos.length > 0;
    } catch {
      if (requestVersion === pageRequestVersionRef.current) setGridError('Could not load more photos.');
      return false;
    } finally {
      if (requestVersion === pageRequestVersionRef.current) setGridLoading(false);
      if (requestVersion === pageRequestVersionRef.current) loadingMoreRef.current = false;
    }
  }, [currentSort, nextCursor]);


  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  const processOneFile = useCallback(
    async (clientKey: string, file: File) => {
      updateUpload(clientKey, { status: 'hashing', progressPercent: 0, message: undefined });

      let sha256: string;
      try {
        sha256 = await sha256Hex(file);
      } catch {
        updateUpload(clientKey, { status: 'failed', message: 'Could not read this file' });
        return;
      }
      updateUpload(clientKey, { sha256, status: 'reserving' });

      let reserved: { photoId: string; pathname: string; generation: number };
      try {
        const response = await fetch('/api/gallery/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploaderName,
            originalFilename: file.name,
            contentType: 'image/jpeg',
            rawBytes: file.size,
            sha256,
          }),
        });
        if (response.status === 409) {
          updateUpload(clientKey, { status: 'duplicate', message: 'This exact photo has already been uploaded' });
          return;
        }
        if (response.status === 413) {
          updateUpload(clientKey, { status: 'failed', message: 'This browser has reached its upload quota' });
          return;
        }
        if (response.status === 507) {
          updateUpload(clientKey, { status: 'failed', message: 'The gallery has reached its storage limit' });
          return;
        }
        if (!response.ok) {
          const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
          updateUpload(clientKey, { status: 'failed', message: errorBody.error ?? 'Could not reserve this upload' });
          return;
        }
        reserved = (await response.json()) as { photoId: string; pathname: string; generation: number };
      } catch {
        updateUpload(clientKey, { status: 'failed', message: 'Network error while reserving upload' });
        return;
      }

      updateUpload(clientKey, {
        photoId: reserved.photoId,
        generation: reserved.generation,
        status: 'uploading',
        progressPercent: 0,
      });

      try {
        await uploadPresigned(reserved.pathname, file, {
          access: 'private',
          handleUploadUrl: '/api/gallery/uploads/blob',
          clientPayload: JSON.stringify({ photoId: reserved.photoId, generation: reserved.generation }),
          contentType: 'image/jpeg',
          onUploadProgress: (event) => updateUpload(clientKey, { progressPercent: event.percentage }),
        });
      } catch {
        updateUpload(clientKey, { status: 'failed', message: 'Upload was interrupted — you can retry' });
        return;
      }

      updateUpload(clientKey, { status: 'processing', progressPercent: 100, processingStartedAt: Date.now() });
    },
    [uploaderName, updateUpload],
  );

  const handleFilesSelected = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      if (!uploaderName.trim()) {
        setNameError('Enter your name before adding photos');
        return;
      }
      setNameError(null);

      const files = Array.from(fileList).slice(0, MAX_FILES_PER_SELECTION);
      const queued: { clientKey: string; file: File }[] = [];

      setUploads((prev) => {
        const next = new Map(prev);
        for (const file of files) {
          const clientKey = crypto.randomUUID();
          const validationError = validateFileClientSide(file, maxJpegBytes);
          next.set(clientKey, {
            clientKey,
            file,
            originalFilename: file.name,
            status: validationError ? 'failed' : 'hashing',
            progressPercent: 0,
            message: validationError ?? undefined,
          });
          if (!validationError) queued.push({ clientKey, file });
        }
        return next;
      });

      await runWithConcurrencyLimit(queued, MAX_CONCURRENT_UPLOADS, ({ clientKey, file }) => processOneFile(clientKey, file));
    },
    [uploaderName, maxJpegBytes, processOneFile],
  );

  const retryUpload = useCallback(
    (clientKey: string) => {
      const item = uploadsRef.current.get(clientKey);
      if (!item) return;
      void processOneFile(clientKey, item.file);
    },
    [processOneFile],
  );

  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      const pending = Array.from(uploadsRef.current.values()).filter((item) => item.status === 'processing' && item.photoId);

      const timedOut = pending.filter((item) => item.processingStartedAt && now - item.processingStartedAt > POLL_TIMEOUT_MS);
      const stillPending = pending.filter((item) => !timedOut.includes(item));

      let statusRows: UploadStatusResponse['uploads'] = [];
      if (stillPending.length > 0) {
        try {
          const ids = stillPending.map((item) => item.photoId as string).slice(0, 100);
          const response = await fetch(`/api/gallery/uploads?ids=${ids.join(',')}`, { cache: 'no-store' });
          if (response.ok) {
            statusRows = ((await response.json()) as UploadStatusResponse).uploads;
          }
        } catch {
          // transient network hiccup; retry next tick
        }
      }

      if (timedOut.length === 0 && statusRows.length === 0) return;

      let becameReady = false;
      setUploads((prev) => {
        const next = new Map(prev);
        for (const item of timedOut) {
          next.set(item.clientKey, { ...item, status: 'failed', message: 'Still processing after 10 minutes — please retry' });
        }
        for (const row of statusRows) {
          const entry = Array.from(next.values()).find((item) => item.photoId === row.photoId);
          if (!entry) continue;
          if (row.status === 'ready') {
            next.set(entry.clientKey, { ...entry, status: 'ready', message: undefined });
            becameReady = true;
          } else if (row.status === 'failed' || row.status === 'rejected') {
            next.set(entry.clientKey, { ...entry, status: row.status, message: describeFailure(row.failureReason) });
          }
        }
        return next;
      });

      if (becameReady) loadFirstPageRef.current();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const uploadItems = useMemo(() => Array.from(uploads.values()).reverse(), [uploads]);

  return (
    <div className="space-y-10">
      <section aria-label="Add your photos" className="card space-y-4 p-6">
        <div>
          <h2 className="font-heading text-2xl text-charcoal">Add your photos</h2>
          <p className="mt-1 text-sm text-muted">JPEG only, up to {formatBytes(maxJpegBytes)} each. Add as many as you like.</p>
        </div>

        <label className="block max-w-sm space-y-1.5 text-sm">
          <span className="label-serif">Your name</span>
          <input
            type="text"
            value={uploaderName}
            onChange={(event) => setUploaderName(event.target.value)}
            maxLength={80}
            required
            placeholder="e.g. Alex Murphy"
            className="w-full rounded-xl border border-stone bg-white px-3 py-2.5"
          />
        </label>
        {nameError && <p className="text-xs text-red-700">{nameError}</p>}

        <label className="block space-y-1.5 text-sm">
          <span className="label-serif">Photos</span>
          <input
            type="file"
            accept="image/jpeg,.jpg,.jpeg"
            multiple
            onChange={(event) => {
              void handleFilesSelected(event.target.files);
              event.target.value = '';
            }}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-stone file:bg-white file:px-3 file:py-1.5 file:text-xs file:uppercase file:tracking-[0.18em]"
          />
        </label>

        {uploadItems.length > 0 && (
          <ul aria-live="polite" className="space-y-2">
            {uploadItems.map((item) => (
              <li key={item.clientKey} className="flex flex-col gap-1 rounded-lg border border-stone/70 bg-white/70 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-charcoal">{item.originalFilename}</span>
                  <span className={statusClassName(item.status)}>{STATUS_LABELS[item.status]}</span>
                </div>
                {(item.status === 'hashing' || item.status === 'reserving' || item.status === 'uploading') && (
                  <progress value={item.progressPercent} max={100} className="h-1.5 w-full" />
                )}
                {item.message && <p className="text-muted">{item.message}</p>}
                {item.status === 'failed' && (
                  <button
                    type="button"
                    className="self-start text-mauve underline-offset-4 hover:underline"
                    onClick={() => retryUpload(item.clientKey)}
                  >
                    Retry
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Gallery photos">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">
            {photos.length} photo{photos.length === 1 ? '' : 's'}
          </p>
          <label className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted">
            Sort
            <select
              value={sortIndex}
              onChange={(event) => setSortIndex(Number(event.target.value))}
              className="rounded-lg border border-stone bg-white px-2 py-1 text-xs normal-case tracking-normal text-charcoal"
              aria-label="Sort gallery photos"
            >
              {SORT_OPTIONS.map((option, index) => (
                <option key={option.label} value={index}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {gridError && (
          <div className="card mb-4 flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm text-red-700">{gridError}</p>
            <button type="button" className="btn btn-outline" onClick={loadFirstPage}>
              Try again
            </button>
          </div>
        )}

        {!gridError && initialLoadDone && photos.length === 0 && !gridLoading && (
          <p className="card p-8 text-center text-sm text-muted">No photos yet — be the first to add one above.</p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setLightboxIndex(index)}
              className="group overflow-hidden rounded-xl border border-stone bg-white/60 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal/40"
            >
              <div className="aspect-square w-full overflow-hidden bg-stone/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/gallery/photos/${photo.id}?variant=thumbnail`}
                  alt={`${photo.originalFilename}, uploaded by ${photo.uploaderName}`}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </div>
              <div className="space-y-0.5 p-2">
                <p className="truncate text-xs font-medium text-charcoal">{photo.originalFilename}</p>
                <p className="truncate text-[11px] text-muted">by {photo.uploaderName}</p>
              </div>
            </button>
          ))}
        </div>

        {gridLoading && <p className="mt-4 text-center text-xs uppercase tracking-[0.2em] text-muted">Loading…</p>}
        {!gridLoading && !nextCursor && photos.length > 0 && (
          <p className="mt-6 text-center text-xs uppercase tracking-[0.2em] text-muted">You&rsquo;ve reached the end</p>
        )}
        <div ref={sentinelRef} aria-hidden className="h-1" />
      </section>

      {lightboxIndex !== null && (
        <GalleryLightbox
          photos={photos}
          index={lightboxIndex}
          canLoadMore={nextCursor !== null}
          onRequestMore={loadMore}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

function GalleryLightbox({
  photos,
  index,
  canLoadMore,
  onRequestMore,
  onClose,
  onNavigate,
}: {
  photos: PhotoSummary[];
  index: number;
  canLoadMore: boolean;
  onRequestMore: () => Promise<boolean>;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const triggerElementRef = useRef<Element | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const photo = photos[index];

  useEffect(() => {
    triggerElementRef.current = document.activeElement;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('close', handleClose);
      if (dialog.open) dialog.close();
      if (triggerElementRef.current instanceof HTMLElement) triggerElementRef.current.focus();
    };
    // Runs once per mount: this component only exists while the lightbox is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goPrev = useCallback(() => {
    if (index > 0) onNavigate(index - 1);
  }, [index, onNavigate]);

  const goNext = useCallback(async () => {
    if (index < photos.length - 1) {
      onNavigate(index + 1);
      return;
    }
    if (canLoadMore) {
      const loaded = await onRequestMore();
      if (loaded) onNavigate(index + 1);
    }
  }, [index, photos.length, canLoadMore, onRequestMore, onNavigate]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === 'ArrowRight') void goNext();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext]);

  if (!photo) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Photo: ${photo.originalFilename}`}
      className="w-[min(96vw,880px)] max-h-[92vh] rounded-2xl border border-stone bg-ivory p-0 backdrop:bg-charcoal/80 open:flex open:flex-col"
      onTouchStart={(event) => {
        touchStartXRef.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const startX = touchStartXRef.current;
        const endX = event.changedTouches[0]?.clientX;
        touchStartXRef.current = null;
        if (startX === null || endX === undefined) return;
        const delta = endX - startX;
        if (delta > 50) goPrev();
        else if (delta < -50) void goNext();
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-stone px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-charcoal">{photo.originalFilename}</p>
          <p className="truncate text-xs text-muted">Uploaded by {photo.uploaderName}</p>
        </div>
        <button type="button" className="btn btn-outline shrink-0" onClick={() => dialogRef.current?.close()} aria-label="Close photo">
          Close
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-charcoal/5 p-2 sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/gallery/photos/${photo.id}?variant=display`}
          alt={`Full-size photo ${photo.originalFilename} uploaded by ${photo.uploaderName}`}
          className="max-h-[68vh] w-auto max-w-full rounded-lg object-contain"
        />
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0}
          aria-label="Previous photo"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-stone bg-ivory/90 px-3 py-2 text-lg text-charcoal shadow disabled:cursor-not-allowed disabled:opacity-40"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => void goNext()}
          disabled={index === photos.length - 1 && !canLoadMore}
          aria-label="Next photo"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-stone bg-ivory/90 px-3 py-2 text-lg text-charcoal shadow disabled:cursor-not-allowed disabled:opacity-40"
        >
          ›
        </button>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-stone px-4 py-3">
        <a href={`/api/gallery/photos/${photo.id}?variant=download`} className="btn btn-primary" download>
          Download
        </a>
      </div>
    </dialog>
  );
}
