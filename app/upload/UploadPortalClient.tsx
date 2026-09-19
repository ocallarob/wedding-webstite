'use client';

import { upload } from '@vercel/blob/client';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  UPLOAD_ALLOWED_CONTENT_TYPES,
  UPLOAD_MAX_ASSETS_PER_VISIT,
} from '../../src/lib/galleryConfig';

type PortalStatus = 'loading' | 'ready' | 'invalid' | 'expired' | 'rate_limited' | 'error';
type AssetStatus = 'queued' | 'uploading' | 'success' | 'error';

type SelectedAsset = {
  id: string;
  file: File;
  status: AssetStatus;
  progress: number;
  error?: string;
};

type ValidationError = { index: number; message: string };

function safeUploadName(name: string): string {
  const safeName = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160);
  return safeName || 'asset';
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPortalClient({ token }: { token: string }) {
  const [status, setStatus] = useState<PortalStatus>('loading');
  const [assets, setAssets] = useState<SelectedAsset[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function authorisePortal() {
      try {
        const response = await fetch(`/api/upload?token=${encodeURIComponent(token)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });

        if (response.status === 410) {
          setStatus('expired');
          return;
        }
        if (response.status === 404) {
          setStatus('invalid');
          return;
        }
        if (response.status === 429) {
          setStatus('rate_limited');
          return;
        }
        if (!response.ok) throw new Error('Upload portal request failed');

        const body = (await response.json()) as { authorized?: boolean };
        setStatus(body.authorized === true ? 'ready' : 'invalid');
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    }

    void authorisePortal();
    return () => controller.abort();
  }, [token]);

  function updateAsset(id: string, update: Partial<SelectedAsset>) {
    setAssets((current) => current.map((asset) => (asset.id === id ? { ...asset, ...update } : asset)));
  }

  function chooseAssets(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    setNotice(null);

    if (files.length > UPLOAD_MAX_ASSETS_PER_VISIT) {
      setAssets([]);
      setNotice(`Select no more than ${UPLOAD_MAX_ASSETS_PER_VISIT} assets per visit.`);
      return;
    }

    setAssets(files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: 'queued',
      progress: 0,
    })));
  }

  async function uploadAsset(asset: SelectedAsset, sessionId: string): Promise<boolean> {
    updateAsset(asset.id, { status: 'uploading', progress: 0, error: undefined });
    const pathname = `guest-submissions/${sessionId}/${crypto.randomUUID()}-${safeUploadName(asset.file.name)}`;

    try {
      const blob = await upload(pathname, asset.file, {
        access: 'private',
        handleUploadUrl: `/api/upload?token=${encodeURIComponent(token)}`,
        contentType: asset.file.type,
        multipart: asset.file.size > 10 * 1024 * 1024,
        clientPayload: JSON.stringify({
          session_id: sessionId,
          display_name: asset.file.name,
          content_type: asset.file.type,
          size_bytes: asset.file.size,
        }),
        onUploadProgress: ({ percentage }) => updateAsset(asset.id, { progress: Math.round(percentage) }),
      });
      const confirmation = await fetch(`/api/upload?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          session_id: sessionId,
          pathname: blob.pathname,
          display_name: asset.file.name,
          content_type: asset.file.type,
          size_bytes: asset.file.size,
        }),
      });
      const confirmationBody = (await confirmation.json().catch(() => ({}))) as { awaiting_review?: boolean };
      if (!confirmation.ok || confirmationBody.awaiting_review !== true) throw new Error('Upload confirmation failed');
      updateAsset(asset.id, { status: 'success', progress: 100 });
      return true;
    } catch {
      updateAsset(asset.id, {
        status: 'error',
        progress: 0,
        error: 'This asset could not be uploaded. Try it again.',
      });
      return false;
    }
  }

  async function submitAssets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pendingAssets = assets.filter((asset) => asset.status !== 'success');
    if (pendingAssets.length === 0 || submitting) return;

    setSubmitting(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/upload?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'initiate',
          assets: pendingAssets.map(({ file }) => ({
            name: file.name,
            content_type: file.type,
            size_bytes: file.size,
          })),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        upload_session_id?: string;
        error?: string;
        errors?: ValidationError[];
      };

      if (!response.ok || !body.upload_session_id) {
        if (Array.isArray(body.errors)) {
          body.errors.forEach(({ index, message }) => {
            const asset = pendingAssets[index];
            if (asset) updateAsset(asset.id, { status: 'error', error: message });
          });
          setNotice('Some selected assets need attention before they can be contributed.');
        } else {
          setNotice(body.error ?? 'The Upload portal is temporarily unavailable. Try again shortly.');
        }
        return;
      }

      const results = await Promise.all(pendingAssets.map((asset) => uploadAsset(asset, body.upload_session_id!)));
      const uploadedCount = results.filter(Boolean).length;
      const failedCount = results.length - uploadedCount;
      if (failedCount === 0) {
        setNotice(`${uploadedCount} ${uploadedCount === 1 ? 'contribution is' : 'contributions are'} uploaded and awaiting review.`);
      } else if (uploadedCount > 0) {
        setNotice(`${uploadedCount} ${uploadedCount === 1 ? 'contribution is' : 'contributions are'} uploaded and awaiting review. ${failedCount} still need${failedCount === 1 ? 's' : ''} attention.`);
      } else {
        setNotice('No contributions were uploaded. Try the failed assets again.');
      }
    } catch {
      setNotice('The Upload portal is temporarily unavailable. Try again shortly.');
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'loading') {
    return (
      <p role="status" aria-live="polite" className="rounded-2xl border border-stone bg-white/80 p-8 text-center text-sm text-muted">
        Checking the Upload portal link…
      </p>
    );
  }

  if (status === 'expired') {
    return (
      <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50/80 p-8 text-center text-sm text-amber-800">
        <p className="font-medium">This Upload portal link has expired.</p>
        <p className="mt-2">Ask the couple to generate a new link.</p>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50/80 p-8 text-center text-sm text-red-700">
        <p className="font-medium">This Upload portal link is invalid or revoked.</p>
        <p className="mt-2">Ask the couple to generate a current link.</p>
      </div>
    );
  }

  if (status === 'rate_limited') {
    return (
      <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50/80 p-8 text-center text-sm text-amber-800">
        Too many checks in a short time. Wait a moment and try the link again.
      </p>
    );
  }

  if (status === 'error') {
    return (
      <p role="alert" className="rounded-2xl border border-red-200 bg-red-50/80 p-8 text-center text-sm text-red-700">
        The Upload portal is temporarily unavailable. Try again shortly.
      </p>
    );
  }

  return (
    <form className="space-y-6" onSubmit={submitAssets}>
      <div className="space-y-2">
        <label htmlFor="guest-assets" className="block text-sm font-medium text-charcoal">Choose photographs or videos</label>
        <input
          id="guest-assets"
          type="file"
          accept={UPLOAD_ALLOWED_CONTENT_TYPES.join(',')}
          multiple
          onChange={chooseAssets}
          disabled={submitting}
          className="block w-full rounded-xl border border-stone bg-white/80 px-3 py-3 text-sm text-charcoal file:mr-3 file:rounded-lg file:border-0 file:bg-mauve file:px-3 file:py-2 file:text-xs file:text-white"
        />
        <p className="text-xs leading-5 text-muted">Select up to {UPLOAD_MAX_ASSETS_PER_VISIT} assets. Each one transfers directly to private storage and is reviewed before publication.</p>
      </div>

      {assets.length > 0 && (
        <ul className="space-y-3" aria-label="Selected assets">
          {assets.map((asset) => (
            <li key={asset.id} className="rounded-xl border border-stone bg-white/70 px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-charcoal">{asset.file.name}</p>
                  <p className="mt-1 text-xs text-muted">{formatFileSize(asset.file.size)} · {asset.file.type || 'Unknown media type'}</p>
                </div>
                <span className="shrink-0 text-xs text-muted" role="status">
                  {asset.status === 'queued' && 'Ready'}
                  {asset.status === 'uploading' && `${asset.progress}%`}
                  {asset.status === 'success' && 'Awaiting review'}
                  {asset.status === 'error' && 'Failed'}
                </span>
              </div>
              {asset.status === 'uploading' && (
                <progress className="mt-3 h-2 w-full accent-mauve" value={asset.progress} max="100" aria-label={`Uploading ${asset.file.name}`} />
              )}
              {asset.status === 'error' && <p className="mt-2 text-xs text-red-700" role="alert">{asset.error}</p>}
            </li>
          ))}
        </ul>
      )}

      {notice && <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-charcoal" role="status" aria-live="polite">{notice}</p>}

      <button
        type="submit"
        disabled={submitting || assets.every((asset) => asset.status === 'success') || assets.length === 0}
        className="w-full rounded-full bg-charcoal px-5 py-3 text-sm text-white transition-colors hover:bg-mauve disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Uploading selected assets…' : 'Contribute selected assets'}
      </button>
    </form>
  );
}
