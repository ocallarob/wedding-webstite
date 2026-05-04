import { sql } from '../../src/lib/db';
import { site } from '../../src/content/site';
import { ExpandableCell } from './ExpandableCell';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

type DietaryValue = { options: string[]; other: string } | null;

type Row = {
  name: string;
  partner_name: string | null;
  email: string;
  token: string;
  invited_at: string | null;
  attending_day1: boolean | null;
  attending_day2: boolean | null;
  partner_attending_day1: boolean | null;
  partner_attending_day2: boolean | null;
  dietary: DietaryValue;
  partner_dietary: DietaryValue;
  song: string | null;
  message: string | null;
  submitted_at: string | null;
};

function formatDietary(d: DietaryValue): string {
  if (!d) return '—';
  const parts = [...(d.options ?? []).map((o) => o.toUpperCase()), d.other].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

function displayName(row: Row) {
  return row.partner_name ? `${row.name} & ${row.partner_name}` : row.name;
}

function status(row: Row): string {
  if (row.submitted_at && anyAttending(row)) return 'Coming';
  if (row.submitted_at) return 'Not coming';
  if (row.invited_at) return 'Invited';
  return 'Not invited';
}

function anyAttending(row: Row) {
  return row.attending_day1 || row.attending_day2 ||
    row.partner_attending_day1 || row.partner_attending_day2;
}

function statusColour(row: Row): string {
  if (row.submitted_at && anyAttending(row)) return 'text-sage font-semibold';
  if (row.submitted_at) return 'text-muted';
  if (row.invited_at) return 'text-mauve';
  return 'text-stone';
}

function attendingMark(val: boolean | null, submitted: boolean) {
  if (val) return '✓';
  if (submitted) return '✗';
  return '—';
}

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const { error } = await searchParams;
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
            <input
              type="password"
              name="password"
              required
              className="w-full rounded-xl border border-stone bg-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-charcoal/40 focus:ring-offset-2 focus:ring-offset-ivory"
            />
          </label>
          {error === 'invalid_password' && (
            <p className="text-xs text-red-700">Password incorrect. Try again.</p>
          )}
          <button type="submit" className="btn btn-primary w-full">Open dashboard</button>
        </form>
      </div>
    );
  }

  const rows = (await sql`
    SELECT
      g.name, g.partner_name, g.email, g.token, g.invited_at,
      r.attending_day1, r.attending_day2,
      r.partner_attending_day1, r.partner_attending_day2,
      r.dietary, r.partner_dietary, r.song, r.message, r.submitted_at
    FROM guests g
    LEFT JOIN rsvps r ON g.token = r.token
    ORDER BY g.name
  `) as Row[];

  const total        = rows.length;
  const invited      = rows.filter((g) => g.invited_at).length;
  const coming       = rows.filter((g) => g.submitted_at && anyAttending(g)).length;
  const notComing    = rows.filter((g) => g.submitted_at && !anyAttending(g)).length;
  const noResponse   = rows.filter((g) => g.invited_at && !g.submitted_at).length;

  return (
    <div className="mx-auto max-w-6xl px-5 pt-[72px] pb-20 space-y-10">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Dashboard</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">{site.coupleNames}</h1>
        <form action="/api/dashboard" method="POST" className="pt-1">
          <input type="hidden" name="action" value="logout" />
          <button type="submit" className="text-xs text-muted underline-offset-4 hover:underline hover:text-charcoal transition-colors">
            Log out
          </button>
        </form>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Total invites', value: total },
          { label: 'Invited', value: invited },
          { label: 'Coming', value: coming },
          { label: 'Not coming', value: notComing },
          { label: 'No response', value: noResponse },
        ].map((stat) => (
          <div key={stat.label} className="card p-4 text-center">
            <p className="font-heading text-3xl font-light text-charcoal">{stat.value}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Guest table */}
      <div className="overflow-x-auto rounded-2xl border border-stone">
        <table className="w-full text-sm">
          <thead className="bg-stone/40 text-left">
            <tr>
              {['Name', 'Email', 'Status', 'Day 1', 'Day 2', 'Dietary', 'Partner Dietary', 'Song', 'Message'].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-muted font-normal whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone/60">
            {rows.map((row) => (
              <tr key={row.token} className="bg-ivory/60 hover:bg-stone/20 transition-colors">
                <td className="px-4 py-3 font-medium text-charcoal whitespace-nowrap">{displayName(row)}</td>
                <td className="px-4 py-3 text-muted">{row.email}</td>
                <td className={`px-4 py-3 whitespace-nowrap ${statusColour(row)}`}>{status(row)}</td>
                <td className="px-4 py-3 text-center text-xs">
                  {row.partner_name ? (
                    <span className="flex flex-col gap-0.5">
                      <span>{attendingMark(row.attending_day1, !!row.submitted_at)}</span>
                      <span>{attendingMark(row.partner_attending_day1, !!row.submitted_at)}</span>
                    </span>
                  ) : attendingMark(row.attending_day1, !!row.submitted_at)}
                </td>
                <td className="px-4 py-3 text-center text-xs">
                  {row.partner_name ? (
                    <span className="flex flex-col gap-0.5">
                      <span>{attendingMark(row.attending_day2, !!row.submitted_at)}</span>
                      <span>{attendingMark(row.partner_attending_day2, !!row.submitted_at)}</span>
                    </span>
                  ) : attendingMark(row.attending_day2, !!row.submitted_at)}
                </td>
                <td className="px-4 py-3 text-muted max-w-[160px] truncate">{formatDietary(row.dietary)}</td>
                <td className="px-4 py-3 text-muted max-w-[160px] truncate">{row.partner_name ? formatDietary(row.partner_dietary) : '—'}</td>
                <td className="px-4 py-3 text-muted max-w-[160px] truncate">{row.song ?? '—'}</td>
                <td className="px-4 py-3 text-muted">
                  {row.message ? <ExpandableCell text={row.message} /> : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted">No guests yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
