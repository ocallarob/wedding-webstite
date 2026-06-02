'use client';

import { useMemo, useState } from 'react';
import { ExpandableCell } from './ExpandableCell';

type Member = {
  full_name: string;
  member_type: string;
  attending_day1: boolean | null;
  attending_day2: boolean | null;
  dietary: unknown;
};

type Row = {
  id: string;
  label: string | null;
  contact_email: string;
  invite_token: string;
  is_paper_invite: boolean;
  invited_at: string | null;
  invite_failed_count: number;
  last_invite_error: string | null;
  reminder_count: number;
  reminder_failed_count: number;
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  song: string | null;
  message: string | null;
  submitted_at: string | null;
  members: Member[];
};

function householdName(row: Row): string {
  if (row.label?.trim()) return row.label.trim();
  if (row.members.length > 0) return row.members.map((m) => m.full_name).join(' & ');
  return row.contact_email;
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
  if (row.invited_at) return 'Invited';
  return 'Not invited';
}

function sendStatus(row: Row): string {
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

function memberSummary(member: Member): string {
  const d = normaliseDietary(member.dietary);
  const dietary = [...d.options.map((o) => o.toUpperCase()), d.other.trim()].filter(Boolean).join(', ') || '—';
  return `${member.full_name} (${member.member_type}) · D1: ${yesNoDash(member.attending_day1)} · D2: ${yesNoDash(member.attending_day2)} · Dietary: ${dietary}`;
}

export function DashboardTable({ rows, csrfToken }: { rows: Row[]; csrfToken: string }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'coming' | 'not_coming' | 'no_response' | 'not_invited'>('all');

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
      const name = householdName(row).toLowerCase();
      const matchesQuery = !query || name.includes(query);
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
              {['Household', 'Contact Email', 'Invite Code', 'Paper Invite', 'Status', 'Send Status', 'Opened RSVP', 'Members', 'Song', 'Message'].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-muted font-normal whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone/60">
            {visibleRows.map((row) => (
              <tr key={row.id} className="bg-ivory/60 hover:bg-stone/20 transition-colors align-top">
                <td className="px-4 py-3 font-medium text-charcoal whitespace-nowrap">{householdName(row)}</td>
                <td className="px-4 py-3 text-muted">{row.contact_email}</td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">
                  <details>
                    <summary className="cursor-pointer text-xs text-mauve underline-offset-4 hover:underline">Show code</summary>
                    <code className="mt-2 inline-block rounded border border-stone bg-white/80 px-2 py-1 text-[11px] text-charcoal">
                      {row.invite_token}
                    </code>
                  </details>
                </td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">{row.is_paper_invite ? 'Yes' : 'No'}</td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">{status(row)}</td>
                <td className="px-4 py-3 text-xs text-muted min-w-[320px]">
                  <p className="whitespace-nowrap">{sendStatus(row)}</p>
                  {row.last_invite_error ? (
                    <p className="mt-1 text-red-700 break-words">{row.last_invite_error}</p>
                  ) : null}
                  <form action="/api/dashboard" method="POST" className="mt-2">
                    <input type="hidden" name="action" value="resend_invite" />
                    <input type="hidden" name="csrf_token" value={csrfToken} />
                    <input type="hidden" name="household_id" value={row.id} />
                    <button type="submit" className="text-[11px] text-mauve underline-offset-4 hover:underline hover:text-charcoal transition-colors">
                      Resend invite
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3 text-xs text-muted min-w-[240px]">
                  <p>{openStatus(row)}</p>
                  {row.open_count > 1 ? <p className="mt-1">First opened {formatDateTime(row.first_opened_at)}</p> : null}
                </td>
                <td className="px-4 py-3 text-xs text-muted min-w-[340px]">
                  <div className="space-y-1">
                    {row.members.map((m, idx) => <p key={`${row.id}-m-${idx}`}>{memberSummary(m)}</p>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted min-w-[220px]">
                  {row.song ? <ExpandableCell text={row.song} collapsedMaxHeightClassName="max-h-10" /> : '—'}
                </td>
                <td className="px-4 py-3 text-muted min-w-[280px]">
                  {row.message ? <ExpandableCell text={row.message} collapsedMaxHeightClassName="max-h-16" /> : '—'}
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-muted">No households match this search and filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
