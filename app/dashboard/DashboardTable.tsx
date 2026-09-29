'use client';

import { useMemo, useRef, useState } from 'react';
import { ExpandableCell } from './ExpandableCell';
import { isGalleryAnnouncementEligible } from '../../src/lib/galleryAnnouncement';

type Member = {
  full_name: string;
  member_type: string;
  attending_day1: boolean | null;
  attending_day2: boolean | null;
  dietary: unknown;
};
type GalleryAssetDownload = {
  asset_id: string;
  display_name: string;
  media_type: 'photo' | 'video';
  request_count: number;
  last_requested_at: string;
};
type GalleryLinkRotation =
  | { status: 'rotating' }
  | { status: 'error'; message: string }
  | { status: 'success'; url: string; copied?: boolean; copyError?: string };



type Row = {
  id: string;
  label: string | null;
  contact_email: string | null;
  address_line_one: string | null;
  evening_invite: boolean;
  invite_token: string;
  is_paper_invite: boolean;
  invited_at: string | null;
  invite_failed_count: number;
  last_invite_error: string | null;
  reminder_count: number;
  reminder_failed_count: number;
  gallery_announcement_sent_at: string | null;
  gallery_announcement_sending_at: string | null;
  gallery_announcement_failed_count: number;
  gallery_announcement_last_error: string | null;
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  gallery_open_count: number;
  gallery_first_opened_at: string | null;
  gallery_last_opened_at: string | null;
  download_request_count: number;
  asset_downloads: GalleryAssetDownload[];
  song: string | null;
  message: string | null;
  submitted_at: string | null;
  members: Member[];
};

function householdName(row: Row): string {
  if (row.label?.trim()) return row.label.trim();
  if (row.members.length > 0) return row.members.map((m) => m.full_name).join(' & ');
  return row.contact_email ?? row.address_line_one ?? 'Unknown household';
}

function surnameKey(name: string): string {
  const primary = name.split('&')[0]?.trim() ?? name;
  const parts = primary.split(/\s+/).filter(Boolean);
  return (parts.at(-1) ?? primary).toLowerCase();
}

function status(row: Row): string {
  const anyAttending = row.members.some((m) => m.attending_day1 || m.attending_day2);
  if (row.submitted_at && anyAttending) return 'Coming';
  if (row.submitted_at) return 'Not coming';
  if (row.invited_at || row.is_paper_invite) return 'Invited';
  return 'Not invited';
}

function sendStatus(row: Row): string {
  if (row.is_paper_invite) return 'Paper invite';
  if (!row.invited_at) return row.invite_failed_count > 0 ? `Invite failed (${row.invite_failed_count})` : 'Not sent';
  if (row.submitted_at) return 'RSVP received';
  if (row.reminder_failed_count > 0) return `Reminder failed (${row.reminder_failed_count})`;
  if (row.reminder_count > 0) return `Reminder sent (${row.reminder_count})`;
  return 'Invite sent';
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function openStatus(row: Row): string {
  if (row.open_count <= 0) return 'Not opened';
  if (row.open_count === 1) return `Opened once on ${formatDateTime(row.last_opened_at)}`;
  return `Last opened ${formatDateTime(row.last_opened_at)}`;
}

function yesNoDash(value: boolean | null): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return '—';
}

function normaliseDietary(input: unknown): { options: string[]; other: string } {
  if (!input || typeof input !== 'object') return { options: [], other: '' };
  const source = input as { options?: unknown; other?: unknown };
  const options = Array.isArray(source.options) ? source.options.filter((v): v is string => typeof v === 'string') : [];
  const other = typeof source.other === 'string' ? source.other : '';
  return { options, other };
}

function memberSummary(member: Member, eveningInvite: boolean): string {
  const d = normaliseDietary(member.dietary);
  const dietary = [...d.options.map((o) => o.toUpperCase()), d.other.trim()].filter(Boolean).join(', ') || '—';
  if (eveningInvite) {
    return `${member.full_name} (${member.member_type}) · Evening: ${yesNoDash(member.attending_day1)} · Day 2: ${yesNoDash(member.attending_day2)} · Dietary: ${dietary}`;
  }
  return `${member.full_name} (${member.member_type}) · D1: ${yesNoDash(member.attending_day1)} · D2: ${yesNoDash(member.attending_day2)} · Dietary: ${dietary}`;
}

function guestTypeLabel(eveningInvite: boolean): string {
  return eveningInvite ? 'Evening' : 'Day';
}

export function DashboardTable({ rows, csrfToken }: { rows: Row[]; csrfToken: string }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'coming' | 'not_coming' | 'no_response' | 'not_invited'>('coming');
  const [galleryLinkRotations, setGalleryLinkRotations] = useState<Record<string, GalleryLinkRotation>>({});
  const rotationInFlight = useRef(new Set<string>());

  const rotateGalleryLink = async (row: Row) => {
    if (rotationInFlight.current.has(row.id) || galleryLinkRotations[row.id]?.status === 'success') return;
    if (!window.confirm(`Rotate the Gallery link for ${householdName(row)}? Existing household links will stop working, and the replacement is shown only once.`)) return;

    rotationInFlight.current.add(row.id);
    setGalleryLinkRotations((current) => ({ ...current, [row.id]: { status: 'rotating' } }));
    const formData = new FormData();
    formData.set('action', 'rotate_gallery_link');
    formData.set('household_id', row.id);
    formData.set('csrf_token', csrfToken);

    try {
      const response = await fetch('/api/dashboard', { method: 'POST', body: formData, cache: 'no-store' });
      const body = (await response.text()).trim();
      if (!response.ok) throw new Error(body || 'Gallery link could not be rotated');
      setGalleryLinkRotations((current) => ({ ...current, [row.id]: { status: 'success', url: body } }));
    } catch (error) {
      setGalleryLinkRotations((current) => ({
        ...current,
        [row.id]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Gallery link could not be rotated',
        },
      }));
    } finally {
      rotationInFlight.current.delete(row.id);
    }
  };

  const copyGalleryLink = async (rowId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setGalleryLinkRotations((current) => ({ ...current, [rowId]: { status: 'success', url, copied: true } }));
    } catch {
      setGalleryLinkRotations((current) => ({
        ...current,
        [rowId]: { status: 'success', url, copyError: 'Could not copy the link. Select and copy it manually.' },
      }));
    }
  };


  const visibleRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const aName = householdName(a);
      const bName = householdName(b);
      const surnameCompare = surnameKey(aName).localeCompare(surnameKey(bName), undefined, { sensitivity: 'base' });
      if (surnameCompare !== 0) return surnameCompare;
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
    });

    const query = searchQuery.trim().toLowerCase();

    return sorted.filter((row) => {
      const searchable = [
        householdName(row),
        row.contact_email,
        row.address_line_one,
        ...row.members.map((member) => member.full_name),
      ]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLowerCase();
      const matchesQuery = !query || searchable.includes(query);
      if (!matchesQuery) return false;

      if (statusFilter === 'all') return true;

      const rowStatus = status(row);
      if (statusFilter === 'coming') return rowStatus === 'Coming';
      if (statusFilter === 'not_coming') return rowStatus === 'Not coming';
      if (statusFilter === 'no_response') return rowStatus === 'Invited';
      if (statusFilter === 'not_invited') return rowStatus === 'Not invited';
      return true;
    });
  }, [rows, searchQuery, statusFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search household name"
          className="w-full max-w-lg rounded-xl border border-stone bg-white/90 px-3 py-2 text-sm text-charcoal placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-mauve/35"
        />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | 'coming' | 'not_coming' | 'no_response' | 'not_invited')}
            className="w-full md:w-56 rounded-xl border border-stone bg-white/90 px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-mauve/35"
            aria-label="Filter by response status"
          >
            <option value="all">All response statuses</option>
            <option value="coming">Coming</option>
            <option value="not_coming">Not coming</option>
            <option value="no_response">No response</option>
            <option value="not_invited">Not invited</option>
          </select>
        </div>
        <p className="shrink-0 text-xs text-muted">{visibleRows.length} shown</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone">
        <table className="w-full text-sm">
          <thead className="bg-stone/40 text-left">
            <tr>
              {['Household', 'Contact', 'Invite Code', 'Guest Type', 'Paper Invite', 'Status', 'Send Status', 'Gallery announcement', 'Gallery link', 'Gallery opens (all-time)', 'Download requests (all-time)', 'Opened RSVP', 'Members', 'Song', 'Message'].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-muted font-normal whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone/60">
            {visibleRows.map((row) => {
              const rotation = galleryLinkRotations[row.id];
              return (
              <tr key={row.id} className="bg-ivory/60 hover:bg-stone/20 transition-colors align-top">
                <td className="px-4 py-3 font-medium text-charcoal whitespace-nowrap">{householdName(row)}</td>
                <td className="px-4 py-3 text-muted">
                  {row.is_paper_invite ? row.address_line_one ?? '—' : row.contact_email ?? '—'}
                </td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">
                  <details>
                    <summary className="cursor-pointer text-xs text-mauve underline-offset-4 hover:underline">Show code</summary>
                    <code className="mt-2 inline-block rounded border border-stone bg-white/80 px-2 py-1 text-[11px] text-charcoal">
                      {row.invite_token}
                    </code>
                  </details>
                </td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">{guestTypeLabel(row.evening_invite)}</td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">{row.is_paper_invite ? 'Yes' : 'No'}</td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">{status(row)}</td>
                <td className="px-4 py-3 text-xs text-muted min-w-[320px]">
                  <p className="whitespace-nowrap">{sendStatus(row)}</p>
                  {row.last_invite_error ? (
                    <p className="mt-1 text-red-700 break-words">{row.last_invite_error}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-muted min-w-[240px]">
                  {isGalleryAnnouncementEligible(row) ? (
                    row.gallery_announcement_sent_at
                      ? `Sent ${formatDateTime(row.gallery_announcement_sent_at)}`
                      : row.gallery_announcement_sending_at
                        ? row.gallery_announcement_last_error ? 'Retry pending' : 'Sending'
                        : row.gallery_announcement_failed_count > 0
                          ? `Failed (${row.gallery_announcement_failed_count})`
                          : 'Not sent'
                  ) : 'Not eligible'}
                  {row.gallery_announcement_last_error && !row.gallery_announcement_sent_at ? (
                    <p className="mt-1 break-words text-red-700">{row.gallery_announcement_last_error}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-muted min-w-[240px]">
                  {isGalleryAnnouncementEligible(row) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void rotateGalleryLink(row)}
                        disabled={rotation?.status === 'rotating' || rotation?.status === 'success'}
                        aria-label={`Rotate Gallery link for ${householdName(row)}`}
                        className="btn btn-primary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {rotation?.status === 'rotating'
                          ? 'Rotating…'
                          : rotation?.status === 'success'
                            ? 'Link rotated'
                            : 'Rotate link'}
                      </button>
                      <p className="mt-2">Revokes all active Gallery links for this household. The replacement URL appears once for manual sharing.</p>
                      {rotation?.status === 'error' ? (
                        <p className="mt-2 break-words text-red-700" role="alert">{rotation.message}</p>
                      ) : null}
                      {rotation?.status === 'success' ? (
                        <div className="mt-2 space-y-2">
                          <label className="block space-y-1">
                            <span className="block text-muted">Replacement Gallery link (shown once)</span>
                            <input
                              type="url"
                              readOnly
                              value={rotation.url}
                              aria-label={`Replacement Gallery link for ${householdName(row)}`}
                              className="w-full rounded border border-stone bg-white px-2 py-1 text-[11px] text-charcoal"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void copyGalleryLink(row.id, rotation.url)}
                            className="rounded border border-stone px-2 py-1 text-xs text-charcoal hover:bg-stone/30"
                          >
                            Copy link
                          </button>
                          {rotation.copied ? <p role="status">Gallery link copied.</p> : null}
                          {rotation.copyError ? (
                            <p className="text-red-700" role="alert">{rotation.copyError}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : 'Not eligible'}
                </td>
                <td className="px-4 py-3 text-xs text-muted min-w-[230px]">
                  <p>{row.gallery_open_count} tab-session {row.gallery_open_count === 1 ? 'open' : 'opens'}</p>
                  {row.gallery_open_count > 0 ? (
                    <p className="mt-1">
                      First: {formatDateTime(row.gallery_first_opened_at)}<br />
                      Last: {formatDateTime(row.gallery_last_opened_at)}
                    </p>
                  ) : <p className="mt-1">Not opened</p>}
                </td>
                <td className="px-4 py-3 text-xs text-muted min-w-[280px]">
                  <p>{row.download_request_count} download {row.download_request_count === 1 ? 'request' : 'requests'}</p>
                  <p className="mt-1">Signed URL issued; file transfer is unconfirmed.</p>
                  {row.asset_downloads.length > 0 ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-mauve underline-offset-4 hover:underline">
                        By asset ({row.asset_downloads.length})
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {row.asset_downloads.map((asset) => (
                          <li key={asset.asset_id}>
                            <p className="break-words text-charcoal">{asset.display_name} ({asset.media_type})</p>
                            <p>{asset.request_count} {asset.request_count === 1 ? 'request' : 'requests'} · latest {formatDateTime(asset.last_requested_at)}</p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : <p className="mt-1">No requests</p>}
                </td>
                <td className="px-4 py-3 text-xs text-muted min-w-[240px]">
                  <p>{openStatus(row)}</p>
                  {row.open_count > 1 ? <p className="mt-1">First opened {formatDateTime(row.first_opened_at)}</p> : null}
                </td>
                <td className="px-4 py-3 text-xs text-muted min-w-[340px]">
                  <div className="space-y-1">
                    {row.members.map((m, idx) => <p key={`${row.id}-m-${idx}`}>{memberSummary(m, row.evening_invite)}</p>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted min-w-[220px]">
                  {row.song ? <ExpandableCell text={row.song} collapsedMaxHeightClassName="max-h-10" /> : '—'}
                </td>
                <td className="px-4 py-3 text-muted min-w-[280px]">
                  {row.message ? <ExpandableCell text={row.message} collapsedMaxHeightClassName="max-h-16" /> : '—'}
                </td>
              </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-muted">No households match this search and filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
