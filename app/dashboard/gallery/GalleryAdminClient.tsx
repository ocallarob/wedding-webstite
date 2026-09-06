'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton } from '../../../src/components/CopyButton';

export type GalleryAdminHousehold = {
  id: string;
  displayName: string;
  email: string | null;
  deliveryStatus: 'sending' | 'sent' | 'failed' | 'unknown' | null;
  deliveryError: string | null;
};

type DeliveryOutcome = 'sent' | 'failed' | 'skipped' | 'pending' | 'unknown';

type DeliveryResponse = {
  householdId: string;
  status: DeliveryOutcome;
  message?: string;
};

const STATUS_LABELS: Record<NonNullable<GalleryAdminHousehold['deliveryStatus']>, string> = {
  sending: 'Pending delivery',
  sent: 'Sent previously',
  failed: 'Failed previously',
  unknown: 'Unknown delivery outcome',
};

const OUTCOME_LABELS: Record<DeliveryOutcome, string> = {
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Skipped',
  pending: 'Pending',
  unknown: 'Unknown',
};

function statusLabel(status: GalleryAdminHousehold['deliveryStatus']): string {
  return status ? STATUS_LABELS[status] : 'Not sent';
}

function needsExplicitResend(status: GalleryAdminHousehold['deliveryStatus']): boolean {
  return status === 'sent' || status === 'failed' || status === 'unknown';
}

export function GalleryAdminClient({
  households,
  galleryUrl,
  csrfToken,
}: {
  households: GalleryAdminHousehold[];
  galleryUrl: string;
  csrfToken: string;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [allowResend, setAllowResend] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, DeliveryResponse>>({});
  const requestIdRef = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmOpen && !dialog.open) dialog.showModal();
    if (!confirmOpen && dialog.open) dialog.close();
  }, [confirmOpen]);

  const selectedRows = useMemo(
    () => households.filter((household) => selectedIds.has(household.id)),
    [households, selectedIds],
  );
  const selectedRequiresResend = selectedRows.some((household) => needsExplicitResend(effectiveStatus(household)));
  const pendingIds = useMemo(
    () => Object.values(outcomes).filter((outcome) => outcome.status === 'pending').map((outcome) => outcome.householdId),
    [outcomes],
  );

  function effectiveStatus(household: GalleryAdminHousehold): GalleryAdminHousehold['deliveryStatus'] {
    const outcome = outcomes[household.id]?.status;
    if (outcome === 'sent' || outcome === 'failed' || outcome === 'unknown') return outcome;
    if (outcome === 'pending') return 'sending';
    return household.deliveryStatus;
  }

  function toggleSelection(householdId: string, checked: boolean) {
    if (checked && !selectedIds.has(householdId) && selectedIds.size >= 100) {
      setSelectionNotice('Select up to 100 households per email batch.');
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(householdId);
      else next.delete(householdId);
      return next;
    });
    setSelectionNotice(null);
  }

  function selectAllUnsent() {
    const eligible = households.filter((household) => {
      const status = effectiveStatus(household);
      return household.email && status !== 'sent' && status !== 'sending' && status !== 'unknown';
    });
    const batch = eligible.slice(0, 100);
    setSelectedIds(new Set(batch.map((household) => household.id)));
    const remaining = Math.max(eligible.length - batch.length, 0);
    setSelectionNotice(remaining > 0 ? `${remaining} eligible household${remaining === 1 ? '' : 's'} remain for the next batch.` : null);
  }


  async function submitDelivery() {
    if (submitting || selectedRows.length === 0) return;
    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;
    setSubmitting(true);
    setRequestError(null);

    try {
      const response = await fetch('/api/gallery/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          requestId,
          householdIds: selectedRows.map((household) => household.id),
          allowResend,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; results?: DeliveryResponse[] };
      if (!response.ok || !body.results) throw new Error(body.error ?? 'Could not send gallery emails');

      const nextOutcomes = { ...outcomes };
      for (const outcome of body.results) nextOutcomes[outcome.householdId] = outcome;
      setOutcomes(nextOutcomes);

      const pending = body.results.filter((outcome) => outcome.status === 'pending');
      if (pending.length > 0) {
        setSelectedIds(new Set(pending.map((outcome) => outcome.householdId)));
      } else {
        setSelectedIds(new Set());
        requestIdRef.current = null;
      }
      setConfirmOpen(false);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Could not send gallery emails');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-outline" onClick={selectAllUnsent}>
          Select all unsent with email
        </button>
        <button type="button" className="btn btn-primary" disabled={selectedRows.length === 0 || submitting} onClick={() => {
          setAllowResend(false);
          setConfirmOpen(true);
        }}>
          {submitting ? 'Sending…' : `Send selected (${selectedRows.length})`}
        </button>
        {selectionNotice && <p className="text-xs text-muted">{selectionNotice}</p>}
      </div>

      {requestError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">{requestError}</p>}

      <div className="overflow-x-auto rounded-2xl border border-stone">
        <table className="w-full text-sm">
          <thead className="bg-stone/40 text-left">
            <tr>
              <th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th>
              <th className="px-4 py-3 text-[11px] font-normal uppercase tracking-[0.18em] text-muted">Household</th>
              <th className="px-4 py-3 text-[11px] font-normal uppercase tracking-[0.18em] text-muted">Email</th>
              <th className="px-4 py-3 text-[11px] font-normal uppercase tracking-[0.18em] text-muted">Delivery status</th>
              <th className="px-4 py-3 text-[11px] font-normal uppercase tracking-[0.18em] text-muted">Result</th>
              <th className="px-4 py-3 text-[11px] font-normal uppercase tracking-[0.18em] text-muted">Manual access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone/60">
            {households.map((household) => {
              const outcome = outcomes[household.id];
              const isSelected = selectedIds.has(household.id);
              const canSelect = Boolean(household.email) && (isSelected || selectedIds.size < 100);
              return (
                <tr key={household.id} className="align-top">
                  <td className="px-4 py-3">
                    <input
                      id={`gallery-household-${household.id}`}
                      type="checkbox"
                      checked={selectedIds.has(household.id)}
                      disabled={!canSelect || submitting}
                      onChange={(event) => toggleSelection(household.id, event.target.checked)}
                      aria-label={`Select ${household.displayName}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-charcoal">
                    <label htmlFor={`gallery-household-${household.id}`}>{household.displayName}</label>
                  </td>
                  <td className="px-4 py-3 text-muted">{household.email ?? 'Manual'}</td>
                  <td className="px-4 py-3 text-muted">
                    <p>{statusLabel(effectiveStatus(household))}</p>
                    {household.deliveryError && <p className="mt-1 max-w-xs text-xs text-red-700">{household.deliveryError}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {outcome ? <p>{OUTCOME_LABELS[outcome.status]}{outcome.message ? ` — ${outcome.message}` : ''}</p> : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {!household.email && <CopyButton text={galleryUrl} label="Copy shared gallery link" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="gallery-email-confirm-title"
        className="w-[min(94vw,620px)] rounded-2xl border border-stone bg-ivory p-0 backdrop:bg-charcoal/60"
        onCancel={(event) => {
          event.preventDefault();
          if (!submitting) setConfirmOpen(false);
        }}
        onClose={() => setConfirmOpen(false)}
      >
        <div className="space-y-4 p-6">
          <div>
            <h2 id="gallery-email-confirm-title" className="font-heading text-2xl text-charcoal">Confirm gallery emails</h2>
            <p className="mt-1 text-sm text-muted">This will process exactly {selectedRows.length} household{selectedRows.length === 1 ? '' : 's'}.</p>
          </div>
          <ul className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-stone bg-white/70 p-3 text-sm">
            {selectedRows.map((household) => (
              <li key={household.id} className="flex flex-wrap justify-between gap-2">
                <span className="font-medium text-charcoal">{household.displayName}</span>
                <span className="text-muted">{household.email} · {statusLabel(effectiveStatus(household))}</span>
              </li>
            ))}
          </ul>
          {selectedRequiresResend && (
            <label className="flex items-start gap-2 text-sm text-charcoal">
              <input type="checkbox" checked={allowResend} onChange={(event) => setAllowResend(event.target.checked)} className="mt-0.5" />
              <span>I understand that previously sent, failed, or unknown deliveries need an explicit resend confirmation. Pending deliveries will never be replaced.</span>
            </label>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-outline" disabled={submitting} onClick={() => setConfirmOpen(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting || (selectedRequiresResend && !allowResend)}
              onClick={() => void submitDelivery()}
            >
              {submitting ? 'Sending…' : 'Confirm and send'}
            </button>
          </div>
        </div>
      </dialog>

      {pendingIds.length > 0 && (
        <p className="text-xs text-muted">Pending deliveries keep their request identity for a safe retry.</p>
      )}
    </div>
  );
}
