import { sql } from '../../src/lib/db';
import { site } from '../../src/content/site';
import { ExpandableCell } from './ExpandableCell';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

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
  invited_at: string | null;
  invite_failed_count: number;
  reminder_count: number;
  reminder_failed_count: number;
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

function status(row: Row): string {
  const anyAttending = row.members.some((m) => m.attending_day1 || m.attending_day2);
  if (row.submitted_at && anyAttending) return 'Coming';
  if (row.submitted_at) return 'Not coming';
  if (row.invited_at) return 'Invited';
  return 'Not invited';
}

function sendStatus(row: Row): string {
  if (!row.invited_at) {
    return row.invite_failed_count > 0 ? `Invite failed (${row.invite_failed_count})` : 'Not sent';
  }
  if (row.submitted_at) return 'RSVP received';
  if (row.reminder_failed_count > 0) return `Reminder failed (${row.reminder_failed_count})`;
  if (row.reminder_count > 0) return `Reminder sent (${row.reminder_count})`;
  return 'Invite sent';
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

type Props = {
  searchParams: Promise<{ error?: string; reminder?: string; sent?: string; failed?: string }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const { error, reminder, sent, failed } = await searchParams;
  const cookieStore = await cookies();
  const adminSession = cookieStore.get('admin_session')?.value;
  const isAuthorized = adminSession === process.env.ADMIN_SECRET;

  if (!isAuthorized) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-5">
        <form action="/api/dashboard" method="POST" className="w-full rounded-2xl border border-stone bg-white/90 p-6 space-y-4">
          <div className="space-y-1 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Dashboard</p>
            <h1 className="font-heading text-2xl font-light text-charcoal">Admin access</h1>
          </div>
          <input type="hidden" name="next" value="/dashboard" />
          <label className="block space-y-1.5 text-sm">
            <span className="label-serif">Password</span>
            <input type="password" name="password" required className="w-full rounded-xl border border-stone bg-white px-3 py-2.5" />
          </label>
          {error === 'invalid_password' && <p className="text-xs text-red-700">Password incorrect. Try again.</p>}
          <button type="submit" className="btn btn-primary w-full">Open dashboard</button>
        </form>
      </div>
    );
  }

  const rows = (await sql`
    SELECT
      h.id,
      h.label,
      h.contact_email,
      h.invited_at,
      h.invite_failed_count,
      h.reminder_count,
      h.reminder_failed_count,
      hr.song,
      hr.message,
      hr.submitted_at,
      COALESCE(json_agg(json_build_object(
        'full_name', m.full_name,
        'member_type', m.member_type,
        'attending_day1', m.attending_day1,
        'attending_day2', m.attending_day2,
        'dietary', m.dietary,
        'sort_order', m.sort_order
      ) ORDER BY m.sort_order, m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]'::json) AS members
    FROM households h
    LEFT JOIN household_members m ON m.household_id = h.id
    LEFT JOIN household_rsvps hr ON hr.household_id = h.id
    GROUP BY h.id, hr.song, hr.message, hr.submitted_at
    ORDER BY COALESCE(h.label, h.contact_email)
  `) as Row[];

  const totalGuests = rows.reduce((sum, r) => sum + r.members.length, 0);
  const invitedGuests = rows.reduce((sum, r) => sum + (r.invited_at ? r.members.length : 0), 0);
  const comingGuests = rows.reduce(
    (sum, r) => sum + (r.submitted_at ? r.members.filter((m) => !!(m.attending_day1 || m.attending_day2)).length : 0),
    0
  );
  const notComingGuests = rows.reduce(
    (sum, r) => sum + (r.submitted_at ? r.members.filter((m) => m.attending_day1 === false && m.attending_day2 === false).length : 0),
    0
  );
  const noResponseGuests = rows.reduce(
    (sum, r) => sum + (r.invited_at && !r.submitted_at ? r.members.length : 0),
    0
  );

  return (
    <div className="mx-auto max-w-6xl px-5 pt-[72px] pb-20 space-y-10">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Dashboard</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">{site.coupleNames}</h1>
        <div className="flex items-center justify-center gap-4 pt-1">
          <form action="/api/dashboard" method="POST">
            <input type="hidden" name="action" value="send_reminders" />
            <button type="submit" className="text-xs text-mauve underline-offset-4 hover:underline hover:text-charcoal transition-colors">Send reminder batch</button>
          </form>
          <form action="/api/dashboard" method="POST">
            <input type="hidden" name="action" value="logout" />
            <button type="submit" className="text-xs text-muted underline-offset-4 hover:underline hover:text-charcoal transition-colors">Log out</button>
          </form>
        </div>
      </header>

      {reminder === 'done' && <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-charcoal">Reminder batch complete: sent {sent ?? '0'}, failed {failed ?? '0'}.</p>}
      {reminder === 'none' && <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-muted">No households currently need a reminder.</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Total guests', value: totalGuests },
          { label: 'Invited guests', value: invitedGuests },
          { label: 'Coming guests', value: comingGuests },
          { label: 'Not coming', value: notComingGuests },
          { label: 'No response', value: noResponseGuests },
        ].map((stat) => (
          <div key={stat.label} className="card p-4 text-center">
            <p className="font-heading text-3xl font-light text-charcoal">{stat.value}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone">
        <table className="w-full text-sm">
          <thead className="bg-stone/40 text-left">
            <tr>
              {['Household', 'Contact Email', 'Status', 'Send Status', 'Members', 'Song', 'Message'].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-muted font-normal whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone/60">
            {rows.map((row) => (
              <tr key={row.id} className="bg-ivory/60 hover:bg-stone/20 transition-colors align-top">
                <td className="px-4 py-3 font-medium text-charcoal whitespace-nowrap">{householdName(row)}</td>
                <td className="px-4 py-3 text-muted">{row.contact_email}</td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">{status(row)}</td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{sendStatus(row)}</td>
                <td className="px-4 py-3 text-xs text-muted min-w-[340px]">
                  <div className="space-y-1">
                    {row.members.map((m, idx) => <p key={`${row.id}-m-${idx}`}>{memberSummary(m)}</p>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted max-w-[160px] truncate">{row.song ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{row.message ? <ExpandableCell text={row.message} /> : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">No households yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
