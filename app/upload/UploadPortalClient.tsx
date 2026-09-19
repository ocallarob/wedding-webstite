'use client';

import { useEffect, useState } from 'react';

type Status = 'loading' | 'ready' | 'invalid' | 'expired' | 'rate_limited' | 'error';

export function UploadPortalClient({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>('loading');

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
    <div className="space-y-4 text-center">
      <p role="status" aria-live="polite" className="text-sm text-charcoal">Upload portal ready.</p>
      <p className="text-sm leading-7 text-muted">
        You can contribute photographs or videos here. Contributions stay pending until they are reviewed.
      </p>
    </div>
  );
}
