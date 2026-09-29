'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { clearGalleryToken, createGallerySessionId, storeGalleryToken } from '../../src/lib/galleryAccess';
import { isUuid } from '../../src/lib/galleryConfig';

type GalleryAsset = {
  asset_key: string;
  media_type: 'photo' | 'video';
  content_type: string;
  size_bytes: number;
  display_name: string;
  created_at: string;
};

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error' }
  | { status: 'unsupported' };

type DownloadState = 'loading' | 'error' | undefined;

type GalleryPage = {
  assets: GalleryAsset[];
  nextCursor: string | null;
};

class GalleryResponseError extends Error {
  constructor(readonly status: number) {
    super('Gallery request failed');
  }
}
const PREVIEW_MAX_RETRIES = 4;
const PREVIEW_RETRY_BASE_DELAY_MS = 500;
const PREVIEW_RETRY_JITTER_MS = 250;

function waitForPreviewRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  if (signal?.aborted) {
    reject(new DOMException('Preview retry aborted', 'AbortError'));
    return promise;
  }

  let timer: number | undefined;
  const abort = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    reject(new DOMException('Preview retry aborted', 'AbortError'));
  };
  timer = window.setTimeout(() => {
    signal?.removeEventListener('abort', abort);
    resolve();
  }, delayMs);
  signal?.addEventListener('abort', abort, { once: true });
  return promise;
}


function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchGalleryPage(
  token: string,
  cursor: string | null,
  signal?: AbortSignal,
  sessionId?: string,
): Promise<GalleryPage> {
  const query = new URLSearchParams({ token });
  if (cursor) query.set('cursor', cursor);

  const response = await fetch(`/api/gallery?${query.toString()}`, {
    signal,
    cache: 'no-store',
    headers: sessionId ? { 'x-gallery-session': sessionId } : undefined,
  });
  if (!response.ok) throw new GalleryResponseError(response.status);

  const body = (await response.json()) as {
    assets?: GalleryAsset[];
    next_cursor?: string | null;
  };

  return {
    assets: Array.isArray(body.assets) ? body.assets : [],
    nextCursor: typeof body.next_cursor === 'string' ? body.next_cursor : null,
  };
}

function LazyPhotoCard({
  asset,
  index,
  preview,
  total,
  onOpen,
  onPreviewError,
  onVisible,
}: {
  asset: GalleryAsset;
  index: number;
  preview: PreviewState;
  total: number;
  onOpen: () => void;
  onPreviewError: () => void;
  onVisible: () => void;
}) {
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const target = cardRef.current;
    if (!target) return;

    if (!('IntersectionObserver' in window)) {
      onVisible();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onVisible();
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [onVisible]);

  return (
    <article ref={cardRef} className="overflow-hidden rounded-2xl border border-stone bg-white/80 p-3 shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-mauve/50 focus:ring-offset-2 focus:ring-offset-white"
        aria-label={`Open photo ${index + 1} of ${total}`}
      >
        <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl bg-stone/25">
          {preview.status === 'idle' && (
            <span className="px-4 text-center text-sm text-muted">Loading preview as you scroll…</span>
          )}
          {preview.status === 'loading' && (
            <span role="status" className="px-4 text-center text-sm text-muted">Loading preview…</span>
          )}
          {preview.status === 'error' && (
            <span role="alert" className="px-4 text-center text-sm text-red-700">Preview unavailable.</span>
          )}
          {preview.status === 'ready' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt="Published gallery photo"
              className="max-h-[28rem] w-full object-contain"
              onError={onPreviewError}
            />
          )}
        </div>
      </button>
    </article>
  );
}

function VideoCard({
  asset,
  downloadState,
  onDownload,
  onPreviewError,
  preview,
}: {
  asset: GalleryAsset;
  downloadState: DownloadState;
  onDownload: () => void;
  onPreviewError: () => void;
  preview: PreviewState;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-stone bg-white/80 p-3 shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
      <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl bg-stone/25">
        {preview.status === 'loading' && (
          <p role="status" className="px-4 text-center text-sm text-muted">Loading preview…</p>
        )}
        {preview.status === 'error' && (
          <p role="alert" className="px-4 text-center text-sm text-red-700">
            Preview unavailable. The download may still be retried.
          </p>
        )}
        {preview.status === 'ready' && (
          <video
            src={preview.url}
            controls
            preload="metadata"
            className="max-h-[28rem] w-full"
            aria-label={asset.display_name}
            onError={onPreviewError}
          />
        )}
        {preview.status === 'unsupported' && (
          <p role="alert" className="p-4 text-center text-sm text-muted">
            This video cannot be previewed in this browser. Use the download action below.
          </p>
        )}
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-charcoal">{asset.display_name}</p>
          <p className="mt-1 text-xs text-muted">
            Video · {formatBytes(asset.size_bytes)}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 text-xs uppercase tracking-[0.14em] text-mauve underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-mauve/40 disabled:cursor-wait disabled:opacity-60"
          onClick={onDownload}
          disabled={downloadState === 'loading'}
          aria-busy={downloadState === 'loading'}
          aria-label={`Download ${asset.display_name}`}
        >
          {downloadState === 'loading' ? 'Preparing…' : 'Download'}
        </button>
      </div>
      {downloadState === 'error' && (
        <p role="alert" aria-live="polite" className="mt-2 text-right text-xs text-red-700">
          Download unavailable. Try again.
        </p>
      )}
    </article>
  );
}

export function GalleryClient({ token }: { token: string }) {
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [lightboxKey, setLightboxKey] = useState<string | null>(null);
  const [movingDirection, setMovingDirection] = useState<-1 | 1 | null>(null);

  const assetsRef = useRef<GalleryAsset[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const loadMorePromiseRef = useRef<Promise<GalleryAsset[]> | null>(null);
  const previewsRef = useRef<Record<string, PreviewState>>({});
  const previewRequestsRef = useRef<Partial<Record<string, Promise<void>>>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const lightboxWasOpenRef = useRef(false);

  const updatePreview = useCallback((assetKey: string, state: PreviewState) => {
    previewsRef.current = { ...previewsRef.current, [assetKey]: state };
    setPreviews((current) => ({ ...current, [assetKey]: state }));
  }, []);

  const loadPreview = useCallback(async (assetKey: string) => {
    const current = previewsRef.current[assetKey];
    if (current?.status === 'ready' || current?.status === 'loading' || current?.status === 'unsupported') return;
    const existingRequest = previewRequestsRef.current[assetKey];
    if (existingRequest) return existingRequest;

    updatePreview(assetKey, { status: 'loading' });
    const request = (async () => {
      try {
        const requestUrl = `/api/gallery/assets/${encodeURIComponent(assetKey)}/url?token=${encodeURIComponent(token)}`;
        const signal = abortControllerRef.current?.signal;
        let response: Response | null = null;
        for (let attempt = 0; attempt <= PREVIEW_MAX_RETRIES; attempt += 1) {
          response = await fetch(requestUrl, { signal, cache: 'no-store' });
          if (response.status !== 429 || attempt === PREVIEW_MAX_RETRIES) break;

          const delay = PREVIEW_RETRY_BASE_DELAY_MS * (2 ** attempt)
            + Math.floor(Math.random() * PREVIEW_RETRY_JITTER_MS);
          await waitForPreviewRetry(delay, signal);
        }
        if (!response || !response.ok) throw new GalleryResponseError(response?.status ?? 503);
        const body = (await response.json()) as { url?: string };
        if (!body.url) throw new Error('Asset URL missing');
        updatePreview(assetKey, { status: 'ready', url: body.url });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        updatePreview(assetKey, { status: 'error' });
      } finally {
        delete previewRequestsRef.current[assetKey];
      }
    })();
    previewRequestsRef.current[assetKey] = request;
    return request;
  }, [token, updatePreview]);

  const appendPage = useCallback((page: GalleryPage, replace: boolean) => {
    const existingAssets = replace ? [] : assetsRef.current;
    const existingKeys = new Set(existingAssets.map((asset) => asset.asset_key));
    const newAssets = page.assets.filter((asset) => !existingKeys.has(asset.asset_key));
    const nextAssets = [...existingAssets, ...newAssets];
    assetsRef.current = nextAssets;
    setAssets(nextAssets);

    const nextPreviews = replace ? {} : { ...previewsRef.current };
    for (const asset of newAssets) nextPreviews[asset.asset_key] = { status: 'idle' };
    previewsRef.current = nextPreviews;
    setPreviews(nextPreviews);

    nextCursorRef.current = page.nextCursor;
    setNextCursor(page.nextCursor);
    for (const asset of newAssets) {
      if (asset.media_type === 'video') void loadPreview(asset.asset_key);
    }
    return newAssets;
  }, [loadPreview]);

  const loadMore = useCallback((): Promise<GalleryAsset[]> => {
    const cursor = nextCursorRef.current;
    if (!cursor) return Promise.resolve([]);
    if (loadMorePromiseRef.current) return loadMorePromiseRef.current;

    const request = (async () => {
      loadingMoreRef.current = true;
      setLoadingMore(true);
      setLoadMoreError(false);
      try {
        const page = await fetchGalleryPage(token, cursor, abortControllerRef.current?.signal);
        const newAssets = appendPage(page, false);
        if (page.nextCursor === cursor) {
          nextCursorRef.current = null;
          setNextCursor(null);
        }
        return newAssets;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return [];
        if (error instanceof GalleryResponseError && error.status === 404) {
          clearGalleryToken(token);
          setLightboxKey(null);
          setStatus('error');
        } else {
          setLoadMoreError(true);
        }
        return [];
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
        loadMorePromiseRef.current = null;
      }
    })();
    loadMorePromiseRef.current = request;
    return request;
  }, [appendPage, token]);

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    assetsRef.current = [];
    nextCursorRef.current = null;
    previewsRef.current = {};
    previewRequestsRef.current = {};
    setAssets([]);
    setPreviews({});
    setDownloads({});
    setNextCursor(null);
    setLoadMoreError(false);
    setLightboxKey(null);
    setStatus('loading');

    async function loadInitialPage() {
      try {
        let sessionId = createGallerySessionId(window.crypto);
        try {
          const sessionStorageKey = `wedding-gallery-open-session:${token}`;
          const storedSessionId = window.sessionStorage.getItem(sessionStorageKey);
          if (isUuid(storedSessionId)) {
            sessionId = storedSessionId;
          } else if (sessionId) {
            window.sessionStorage.setItem(sessionStorageKey, sessionId);
          }
        } catch {
          // Per-tab deduplication is unavailable; count this open independently.
        }

        const page = await fetchGalleryPage(token, null, controller.signal, sessionId);
        if (controller.signal.aborted) return;
        storeGalleryToken(token);
        appendPage(page, true);
        setStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof GalleryResponseError && error.status === 404) clearGalleryToken(token);
        setStatus('error');
      }
    }

    void loadInitialPage();
    return () => {
      controller.abort();
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    };
  }, [appendPage, token]);

  useEffect(() => {
    if (status !== 'ready') return;
    const target = loadMoreSentinelRef.current;
    if (!target || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && nextCursorRef.current && !loadingMoreRef.current) {
          void loadMore();
        }
      },
      { rootMargin: '600px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, status]);

  const photoAssets = useMemo(
    () => assets.filter((asset) => asset.media_type === 'photo'),
    [assets],
  );
  const lightboxAsset = lightboxKey
    ? photoAssets.find((asset) => asset.asset_key === lightboxKey) ?? null
    : null;
  const lightboxIndex = lightboxKey
    ? photoAssets.findIndex((asset) => asset.asset_key === lightboxKey)
    : -1;
  const lightboxPreview = lightboxAsset ? previews[lightboxAsset.asset_key] : undefined;
  const lightboxPreviewUrl = lightboxPreview?.status === 'ready' ? lightboxPreview.url : null;

  const openLightbox = useCallback((assetKey: string) => {
    const activeElement = document.activeElement;
    returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    setLightboxKey(assetKey);
    void loadPreview(assetKey);
  }, [loadPreview]);
  useEffect(() => {
    if (lightboxKey) void loadPreview(lightboxKey);
  }, [lightboxKey, loadPreview]);

  const closeLightbox = useCallback(() => {
    setLightboxKey(null);
  }, []);

  const moveLightbox = useCallback(async (direction: -1 | 1) => {
    if (!lightboxKey || movingDirection) return;
    const currentIndex = assetsRef.current
      .filter((asset) => asset.media_type === 'photo')
      .findIndex((asset) => asset.asset_key === lightboxKey);
    if (currentIndex < 0) return;

    const loadedPhotos = assetsRef.current.filter((asset) => asset.media_type === 'photo');
    if (direction === -1) {
      if (currentIndex > 0) setLightboxKey(loadedPhotos[currentIndex - 1].asset_key);
      return;
    }
    if (currentIndex < loadedPhotos.length - 1) {
      setLightboxKey(loadedPhotos[currentIndex + 1].asset_key);
      return;
    }
    if (!nextCursorRef.current) return;

    setMovingDirection(direction);
    try {
      while (nextCursorRef.current) {
        const cursorBefore: string = nextCursorRef.current;
        await loadMore();
        const latestPhotos = assetsRef.current.filter((asset) => asset.media_type === 'photo');
        const latestIndex = latestPhotos.findIndex((asset) => asset.asset_key === lightboxKey);
        if (latestIndex >= 0 && latestIndex < latestPhotos.length - 1) {
          setLightboxKey(latestPhotos[latestIndex + 1].asset_key);
          return;
        }
        if (nextCursorRef.current === cursorBefore) break;
      }
    } finally {
      setMovingDirection(null);
    }
  }, [lightboxKey, loadMore, movingDirection]);

  const download = useCallback(async (assetKey: string) => {
    setDownloads((current) => ({ ...current, [assetKey]: 'loading' }));
    try {
      const response = await fetch(
        `/api/gallery/assets/${encodeURIComponent(assetKey)}/url?token=${encodeURIComponent(token)}&download=1`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new GalleryResponseError(response.status);
      const body = (await response.json()) as { url?: string };
      if (!body.url) throw new Error('Download URL missing');

      const opened = window.open(body.url, '_blank', 'noopener,noreferrer');
      if (!opened) throw new Error('Download window blocked');
      setDownloads((current) => ({ ...current, [assetKey]: undefined }));
    } catch {
      setDownloads((current) => ({ ...current, [assetKey]: 'error' }));
    }
  }, [token]);

  useEffect(() => {
    if (lightboxKey === null) {
      if (lightboxWasOpenRef.current) {
        lightboxWasOpenRef.current = false;
        returnFocusRef.current?.focus();
      }
      return;
    }

    lightboxWasOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxKey]);

  useEffect(() => {
    if (lightboxKey === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLightbox();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void moveLightbox(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        void moveLightbox(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeLightbox, lightboxKey, moveLightbox]);

  if (status === 'loading') {
    return (
      <p role="status" aria-live="polite" className="rounded-2xl border border-stone bg-white/80 p-8 text-center text-sm text-muted">
        Loading the event gallery…
      </p>
    );
  }

  if (status === 'error') {
    return (
      <p role="alert" className="rounded-2xl border border-red-200 bg-red-50/80 p-8 text-center text-sm text-red-700">
        This Gallery link is unavailable. Check the link and try again.
      </p>
    );
  }

  if (assets.length === 0) {
    return (
      <p className="rounded-2xl border border-stone bg-white/80 p-8 text-center text-sm text-muted">
        The event gallery is ready for its first published memories.
      </p>
    );
  }

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Published event gallery assets">
        {assets.map((asset) => {
          const preview = previews[asset.asset_key] ?? { status: 'idle' as const };
          const downloadState = downloads[asset.asset_key];
          if (asset.media_type === 'video') {
            return (
              <VideoCard
                key={asset.asset_key}
                asset={asset}
                downloadState={downloadState}
                onDownload={() => void download(asset.asset_key)}
                onPreviewError={() => updatePreview(asset.asset_key, { status: 'unsupported' })}
                preview={preview}
              />
            );
          }

          const photoIndex = photoAssets.findIndex((photo) => photo.asset_key === asset.asset_key);
          return (
            <LazyPhotoCard
              key={asset.asset_key}
              asset={asset}
              index={photoIndex}
              preview={preview}
              total={photoAssets.length}
              onOpen={() => openLightbox(asset.asset_key)}
              onPreviewError={() => updatePreview(asset.asset_key, { status: 'error' })}
              onVisible={() => void loadPreview(asset.asset_key)}
            />
          );
        })}
      </div>

      {loadMoreError && (
        <div className="mt-6 flex flex-col items-center gap-2 text-center">
          <p role="alert" className="text-sm text-red-700">More memories could not be loaded.</p>
          <button
            type="button"
            onClick={() => void loadMore()}
            className="text-xs uppercase tracking-[0.16em] text-mauve underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-mauve/40"
          >
            Try again
          </button>
        </div>
      )}
      <div ref={loadMoreSentinelRef} className="min-h-8 pt-5 text-center text-sm text-muted" aria-live="polite">
        {loadingMore ? 'Loading more memories…' : null}
      </div>

      {lightboxAsset && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-charcoal/90 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gallery-lightbox-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeLightbox();
          }}
        >
          <div className="relative flex max-h-full w-full max-w-6xl flex-col items-center gap-4">
            <h2 id="gallery-lightbox-title" className="sr-only">Photo viewer</h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeLightbox}
              className="absolute right-0 top-0 z-10 rounded-full border border-white/40 bg-charcoal/60 px-3 py-2 text-xs uppercase tracking-[0.16em] text-white hover:bg-charcoal focus:outline-none focus:ring-2 focus:ring-white"
            >
              Close
            </button>
            <div className="flex w-full items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void moveLightbox(-1)}
                disabled={lightboxIndex <= 0 || movingDirection !== null}
                aria-label="Previous photo"
                className="rounded-full border border-white/40 bg-charcoal/60 px-3 py-2 text-xl text-white hover:bg-charcoal disabled:cursor-not-allowed disabled:opacity-35 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <span aria-hidden>←</span>
              </button>
              <div className="flex max-h-[78vh] min-h-64 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black/30 p-2">
                {lightboxPreviewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={lightboxPreviewUrl}
                    alt="Published gallery photo"
                    className="max-h-[76vh] max-w-full object-contain"
                    onError={() => updatePreview(lightboxAsset.asset_key, { status: 'error' })}
                  />
                )}
                {(!lightboxPreview || lightboxPreview.status === 'idle' || lightboxPreview.status === 'loading') && (
                  <p role="status" className="text-sm text-white">Loading photo…</p>
                )}
                {lightboxPreview?.status === 'error' && (
                  <p role="alert" className="text-sm text-red-200">This photo preview is unavailable.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void moveLightbox(1)}
                disabled={(lightboxIndex >= photoAssets.length - 1 && !nextCursor) || movingDirection !== null}
                aria-label="Next photo"
                className="rounded-full border border-white/40 bg-charcoal/60 px-3 py-2 text-xl text-white hover:bg-charcoal disabled:cursor-not-allowed disabled:opacity-35 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <span aria-hidden>→</span>
              </button>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => void download(lightboxAsset.asset_key)}
                disabled={downloads[lightboxAsset.asset_key] === 'loading'}
                aria-busy={downloads[lightboxAsset.asset_key] === 'loading'}
                className="rounded-full border border-white/50 bg-white/10 px-5 py-2 text-xs uppercase tracking-[0.16em] text-white hover:bg-white/20 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-white"
              >
                {downloads[lightboxAsset.asset_key] === 'loading' ? 'Preparing…' : 'Download'}
              </button>
              {downloads[lightboxAsset.asset_key] === 'error' && (
                <p role="alert" className="text-xs text-red-200">Download unavailable. Try again.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
