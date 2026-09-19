'use client';

import { useEffect, useState } from 'react';

type GalleryAsset = {
  asset_key: string;
  media_type: 'photo' | 'video';
  content_type: string;
  size_bytes: number;
  display_name: string;
  created_at: string;
};

type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error' }
  | { status: 'unsupported' };

type DownloadState = 'loading' | 'error' | undefined;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GalleryClient({ token }: { token: string }) {
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();

    async function loadGallery() {
      try {
        const response = await fetch(`/api/gallery?token=${encodeURIComponent(token)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Gallery request failed');

        const body = (await response.json()) as { assets?: GalleryAsset[] };
        const nextAssets = Array.isArray(body.assets) ? body.assets : [];
        setAssets(nextAssets);
        setPreviews(Object.fromEntries(nextAssets.map((asset) => [asset.asset_key, { status: 'loading' }])));
        setStatus('ready');

        await Promise.all(
          nextAssets.map(async (asset) => {
            try {
              const assetResponse = await fetch(
                `/api/gallery/assets/${encodeURIComponent(asset.asset_key)}/url?token=${encodeURIComponent(token)}`,
                { signal: controller.signal, cache: 'no-store' },
              );
              if (!assetResponse.ok) throw new Error('Asset request failed');
              const assetBody = (await assetResponse.json()) as { url?: string };
              if (!assetBody.url) throw new Error('Asset URL missing');
              setPreviews((current) => ({
                ...current,
                [asset.asset_key]: { status: 'ready', url: assetBody.url as string },
              }));
            } catch {
              if (!controller.signal.aborted) {
                setPreviews((current) => ({ ...current, [asset.asset_key]: { status: 'error' } }));
              }
            }
          }),
        );
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    }

    void loadGallery();
    return () => controller.abort();
  }, [token]);

  async function download(assetKey: string) {
    setDownloads((current) => ({ ...current, [assetKey]: 'loading' }));
    try {
      const response = await fetch(
        `/api/gallery/assets/${encodeURIComponent(assetKey)}/url?token=${encodeURIComponent(token)}&download=1`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('Download request failed');
      const body = (await response.json()) as { url?: string };
      if (!body.url) throw new Error('Download URL missing');

      const opened = window.open(body.url, '_blank', 'noopener,noreferrer');
      if (!opened) throw new Error('Download window blocked');
      setDownloads((current) => ({ ...current, [assetKey]: undefined }));
    } catch {
      setDownloads((current) => ({ ...current, [assetKey]: 'error' }));
    }
  }

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
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Published event gallery assets">
      {assets.map((asset) => {
        const preview = previews[asset.asset_key] ?? { status: 'loading' as const };
        const downloadState = downloads[asset.asset_key];

        return (
          <article key={asset.asset_key} className="overflow-hidden rounded-2xl border border-stone bg-white/80 p-3 shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
            <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl bg-stone/25">
              {preview.status === 'loading' && (
                <p role="status" className="px-4 text-center text-sm text-muted">Loading preview…</p>
              )}
              {preview.status === 'error' && (
                <p role="alert" className="px-4 text-center text-sm text-red-700">
                  Preview unavailable. The download may still be retried.
                </p>
              )}
              {preview.status === 'ready' && asset.media_type === 'photo' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.url} alt={asset.display_name} className="max-h-[28rem] w-full object-contain" loading="lazy" />
              )}
              {preview.status === 'ready' && asset.media_type === 'video' && (
                <video
                  controls
                  preload="metadata"
                  className="max-h-[28rem] w-full"
                  aria-label={asset.display_name}
                  onError={() => setPreviews((current) => ({ ...current, [asset.asset_key]: { status: 'unsupported' } }))}
                >
                  <source src={preview.url} type={asset.content_type} />
                </video>
              )}
              {preview.status === 'unsupported' && asset.media_type === 'video' && (
                <p role="alert" className="p-4 text-center text-sm text-muted">
                  This video cannot be previewed in this browser. Use the download action below.
                </p>
              )}
            </div>

            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-charcoal">{asset.display_name}</p>
                <p className="mt-1 text-xs text-muted">
                  {asset.media_type === 'photo' ? 'Photograph' : 'Video'} · {formatBytes(asset.size_bytes)}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs uppercase tracking-[0.14em] text-mauve underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-mauve/40 disabled:cursor-wait disabled:opacity-60"
                onClick={() => void download(asset.asset_key)}
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
      })}
    </div>
  );
}
