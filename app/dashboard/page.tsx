import { sql } from '../../src/lib/db';
import { site } from '../../src/content/site';

export const dynamic = 'force-dynamic';

type Row = {
  name: string;
  email: string;
  token: string;
  invited_at: string | null;
  attending_day1: boolean | null;
  attending_day2: boolean | null;
  dietary: string | null;
  song: string | null;
  message: string | null;
  submitted_at: string | null;
};

function status(row: Row): string {
  if (row.submitted_at && (row.attending_day1 || row.attending_day2)) return 'Coming';
  if (row.submitted_at) return 'Not coming';
  if (row.invited_at) return 'Invited';
  return 'Not invited';
}

function statusColour(row: Row): string {
  if (row.submitted_at && (row.attending_day1 || row.attending_day2)) return 'text-sage font-semibold';
  if (row.submitted_at) return 'text-muted';
  if (row.invited_at) return 'text-mauve';
  return 'text-stone';
}

export default async function DashboardPage() {
  const rows = (await sql`
    SELECT
      g.name, g.email, g.token, g.invited_at,
      r.attending_day1, r.attending_day2, r.dietary, r.song, r.message, r.submitted_at
    FROM guests g
    LEFT JOIN rsvps r ON g.token = r.token
    ORDER BY g.name
  `) as Row[];

  const total       = rows.length;
  const invited     = rows.filter((g) => g.invited_at).length;
  const coming      = rows.filter((g) => g.submitted_at && (g.attending_day1 || g.attending_day2)).length;
  const notComing   = rows.filter((g) => g.submitted_at && !g.attending_day1 && !g.attending_day2).length;
  const noResponse  = rows.filter((g) => g.invited_at && !g.submitted_at).length;

  return (
    <div className="mx-auto max-w-5xl px-5 pt-[72px] pb-20 space-y-10">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Dashboard</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">{site.coupleNames}</h1>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Total guests', value: total },
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
              {['Name', 'Email', 'Status', 'Day 1', 'Day 2', 'Dietary', 'Song', 'Message'].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-muted font-normal whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone/60">
            {rows.map((row) => (
              <tr key={row.token} className="bg-ivory/60 hover:bg-stone/20 transition-colors">
                <td className="px-4 py-3 font-medium text-charcoal whitespace-nowrap">{row.name}</td>
                <td className="px-4 py-3 text-muted">{row.email}</td>
                <td className={`px-4 py-3 whitespace-nowrap ${statusColour(row)}`}>{status(row)}</td>
                <td className="px-4 py-3 text-center">{row.attending_day1 ? '✓' : row.submitted_at ? '✗' : '—'}</td>
                <td className="px-4 py-3 text-center">{row.attending_day2 ? '✓' : row.submitted_at ? '✗' : '—'}</td>
                <td className="px-4 py-3 text-muted max-w-[160px] truncate">{row.dietary ?? '—'}</td>
                <td className="px-4 py-3 text-muted max-w-[160px] truncate">{row.song ?? '—'}</td>
                <td className="px-4 py-3 text-muted max-w-[200px] truncate">{row.message ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted">No guests yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
