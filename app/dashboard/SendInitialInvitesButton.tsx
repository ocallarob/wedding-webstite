'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type SendResult = {
  sent?: number;
  failed?: number;
  remaining?: number;
  note?: string;
  message?: string;
  error?: string;
};

export function SendInitialInvitesButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  async function onSendInitialInvites() {
    setSubmitting(true);
    setResult(null);
    try {
      const response = await fetch('/api/invites/send', {
        method: 'POST',
      });
      const data = (await response.json()) as SendResult;
      if (!response.ok) {
        setResult({ error: data.error ?? 'Failed to send invites' });
        return;
      }
      setResult(data);
      router.refresh();
    } catch {
      setResult({ error: 'Failed to send invites' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={onSendInitialInvites}
        disabled={submitting}
        className="text-xs text-mauve underline-offset-4 hover:underline hover:text-charcoal transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Sending invites…' : 'Send initial invites'}
      </button>
      {result?.error && <p className="mt-2 text-xs text-red-700">{result.error}</p>}
      {!result?.error && result?.message && <p className="mt-2 text-xs text-muted">{result.message}</p>}
      {!result?.error && (result?.sent !== undefined || result?.failed !== undefined) && (
        <p className="mt-2 text-xs text-muted">
          Invite batch complete: sent {result.sent ?? 0}, failed {result.failed ?? 0}
          {result.remaining ? `. ${result.note ?? `Run again to send the next ${result.remaining} invites`}.` : '.'}
        </p>
      )}
    </div>
  );
}
