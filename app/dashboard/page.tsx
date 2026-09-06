import Link from 'next/link';
import { cookies } from 'next/headers';
import { sql } from '../../src/lib/db';
import { site } from '../../src/content/site';
import { createCsrfToken } from '../../src/lib/csrf';
import { verifyAdminSessionToken } from '../../src/lib/adminSession';
import { AdminLoginForm } from './AdminLoginForm';
import { DashboardTable } from './DashboardTable';

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
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  song: string | null;
  message: string | null;
  submitted_at: string | null;
  members: Member[];
};

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const cookieStore = await cookies();
  const adminSession = cookieStore.get('admin_session')?.value;
  const adminSecret = process.env.ADMIN_SECRET;
  const isAuthorized = !!adminSecret && verifyAdminSessionToken(adminSession, adminSecret);
  const csrfToken = isAuthorized && adminSecret && adminSession ? createCsrfToken(adminSession, adminSecret) : '';

  if (!isAuthorized) {
    return <AdminLoginForm error={error} nextPath="/dashboard" />;
  }

  const rows = (await sql`
    SELECT
      h.id,
      h.label,
      h.contact_email,
      h.address_line_one,
      h.evening_invite,
      h.invite_token,
      h.is_paper_invite,
      h.invited_at,
      h.invite_failed_count,
      h.last_invite_error,
      h.reminder_count,
      h.reminder_failed_count,
      COALESCE(ho.open_count, 0) AS open_count,
      ho.first_opened_at,
      ho.last_opened_at,
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
    LEFT JOIN (
      SELECT
        household_id,
        COUNT(*)::int AS open_count,
        MIN(opened_at) AS first_opened_at,
        MAX(opened_at) AS last_opened_at
      FROM household_rsvp_opens
      GROUP BY household_id
    ) ho ON ho.household_id = h.id
    GROUP BY h.id, hr.song, hr.message, hr.submitted_at, ho.open_count, ho.first_opened_at, ho.last_opened_at
  `) as Row[];

  const totalGuests = rows.reduce((sum, r) => sum + r.members.length, 0);
  const invitedGuests = rows.reduce((sum, r) => sum + (r.invited_at || r.is_paper_invite ? r.members.length : 0), 0);
  const comingGuests = rows.reduce(
    (sum, r) => sum + (r.submitted_at ? r.members.filter((m) => !!(m.attending_day1 || m.attending_day2)).length : 0),
    0
  );
  const notComingGuests = rows.reduce(
    (sum, r) => sum + (r.submitted_at ? r.members.filter((m) => m.attending_day1 === false && m.attending_day2 === false).length : 0),
    0
  );
  const noResponseGuests = rows.reduce(
    (sum, r) => sum + ((r.invited_at || r.is_paper_invite) && !r.submitted_at ? r.members.length : 0),
    0
  );

  return (
    <div className="mx-auto max-w-6xl px-5 pt-[72px] pb-20 space-y-10">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Dashboard</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">{site.coupleNames}</h1>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
          <Link href="/dashboard/gallery" className="text-xs text-mauve underline-offset-4 hover:text-charcoal hover:underline">
            Gallery admin
          </Link>
          <form action="/api/dashboard" method="POST">
            <input type="hidden" name="action" value="logout" />
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <button type="submit" className="text-xs text-muted underline-offset-4 hover:text-charcoal hover:underline">
              Log out
            </button>
          </form>
        </div>
      </header>

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

      <DashboardTable rows={rows} />
    </div>
  );
}
