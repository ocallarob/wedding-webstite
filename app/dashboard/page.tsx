import { sql } from '../../src/lib/db';
import { site } from '../../src/content/site';
import { DashboardTable } from './DashboardTable';
import { SendInitialInvitesButton } from './SendInitialInvitesButton';
import { cookies } from 'next/headers';
import { verifyAdminSessionToken } from '../../src/lib/adminSession';
import { createCsrfToken } from '../../src/lib/csrf';

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
  invite_token: string;
  is_paper_invite: boolean;
  invited_at: string | null;
  invite_failed_count: number;
  last_invite_error: string | null;
  reminder_count: number;
  reminder_failed_count: number;
  song: string | null;
  message: string | null;
  submitted_at: string | null;
  members: Member[];
};

type Props = {
  searchParams: Promise<{ error?: string; reminder?: string; resend?: string; sent?: string; failed?: string }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const { error, reminder, resend, sent, failed } = await searchParams;
  const cookieStore = await cookies();
  const adminSession = cookieStore.get('admin_session')?.value;
  const adminSecret = process.env.ADMIN_SECRET;
  const isAuthorized = !!adminSecret && verifyAdminSessionToken(adminSession, adminSecret);
  const csrfToken = isAuthorized && adminSecret && adminSession ? createCsrfToken(adminSession, adminSecret) : '';

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
          {error === 'missing_admin_secret' && (
            <p className="text-xs text-red-700">
              Dashboard is not configured. Add `ADMIN_SECRET` to this environment and redeploy.
            </p>
          )}
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
      h.invite_token,
      h.is_paper_invite,
      h.invited_at,
      h.invite_failed_count,
      h.last_invite_error,
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
          <SendInitialInvitesButton />
          <form action="/api/dashboard" method="POST">
            <input type="hidden" name="action" value="send_reminders" />
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <button type="submit" className="text-xs text-mauve underline-offset-4 hover:underline hover:text-charcoal transition-colors">Send reminder batch</button>
          </form>
          <form action="/api/dashboard" method="POST">
            <input type="hidden" name="action" value="logout" />
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <button type="submit" className="text-xs text-muted underline-offset-4 hover:underline hover:text-charcoal transition-colors">Log out</button>
          </form>
        </div>
      </header>

      {reminder === 'done' && <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-charcoal">Reminder batch complete: sent {sent ?? '0'}, failed {failed ?? '0'}.</p>}
      {reminder === 'none' && <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-muted">No households currently need a reminder.</p>}
      {resend === 'done' && <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-charcoal">Invite resend complete.</p>}
      {resend === 'failed' && <p className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-center text-sm text-red-700">Invite resend failed. See row send error for details.</p>}

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

      <DashboardTable rows={rows} csrfToken={csrfToken} />
    </div>
  );
}
