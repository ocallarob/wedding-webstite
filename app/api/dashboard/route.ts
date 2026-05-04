import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { sql } from '../../../src/lib/db';

export const dynamic = 'force-dynamic';
const ADMIN_COOKIE_NAME = 'admin_session';
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;
const REMINDER_BATCH_LIMIT = 100;

function isAuthorized(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret');
  const cookieSecret = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return secret === process.env.ADMIN_SECRET || cookieSecret === process.env.ADMIN_SECRET;
}

function buildReminderEmailHtml(displayName: string, rsvpUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>RSVP reminder</title>
</head>
<body style="margin:0;padding:0;background:#fdfbf7;font-family:Helvetica,Arial,sans-serif;color:#3a3530">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px">
    <div style="text-align:center;margin-bottom:28px">
      <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#9c7a8c">
        28 August 2026 &nbsp;·&nbsp; Lough Erne Resort
      </p>
      <h1 style="margin:12px 0 0;font-family:Georgia,serif;font-weight:300;font-size:38px;letter-spacing:0.1em;color:#3a3530">
        Rob &amp; Alannah
      </h1>
    </div>

    <div style="border:1px solid #e8e2da;border-radius:16px;padding:36px;background:#ffffff">
      <p style="margin:0 0 16px;font-size:15px">Dear ${displayName},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#3a3530">
        A gentle reminder to RSVP for our wedding weekend.
      </p>
      <p style="margin:0 0 28px;font-size:15px;line-height:1.75;color:#3a3530">
        We would be so grateful if you could let us know when you have a moment.
      </p>

      <div style="text-align:center">
        <a href="${rsvpUrl}"
           style="display:inline-block;background:#dbb8b8;color:#3a3530;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase">
          RSVP Now
        </a>
      </div>

      <p style="margin:28px 0 0;font-size:12px;color:#7a756f;text-align:center">
        Kindly respond by 1 August 2026
      </p>
    </div>

    <p style="margin-top:32px;text-align:center;font-size:12px;color:#9c7a8c;letter-spacing:0.15em">
      A &nbsp;◇&nbsp; R
    </p>
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const households = await sql`
    SELECT
      h.id, h.label, h.contact_email, h.invited_at,
      h.invite_failed_count, h.reminder_count, h.reminder_failed_count,
      hr.song, hr.message, hr.submitted_at,
      COALESCE(json_agg(json_build_object(
        'id', m.id,
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
  `;

  const anyAttending = (members: any[]) => members.some((m) => m.attending_day1 || m.attending_day2);
  const total = households.length;
  const invited = households.filter((h) => h.invited_at).length;
  const rsvpd_yes = households.filter((h) => h.submitted_at && anyAttending(h.members as any[])).length;
  const rsvpd_no = households.filter((h) => h.submitted_at && !anyAttending(h.members as any[])).length;
  const no_response = households.filter((h) => h.invited_at && !h.submitted_at).length;

  return NextResponse.json({ total, invited, rsvpd_yes, rsvpd_no, no_response, households });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = formData.get('action');

  if (action === 'logout') {
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.cookies.delete(ADMIN_COOKIE_NAME);
    return response;
  }

  if (action === 'send_reminders') {
    if (!isAuthorized(request)) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));

    const resend = new Resend(process.env.RESEND_API_KEY);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie';

    const rows = await sql`
      SELECT h.id, h.invite_token, h.contact_email,
        COALESCE((SELECT string_agg(m.full_name, ' & ' ORDER BY m.sort_order, m.created_at) FROM household_members m WHERE m.household_id = h.id), h.contact_email) as display_name
      FROM households h
      LEFT JOIN household_rsvps hr ON hr.household_id = h.id
      WHERE h.invited_at IS NOT NULL AND hr.household_id IS NULL
      ORDER BY COALESCE(h.label, h.contact_email)
      LIMIT ${REMINDER_BATCH_LIMIT}
    `;

    if (rows.length === 0) return NextResponse.redirect(new URL('/dashboard?reminder=none', request.url));

    const results = await Promise.allSettled(rows.map(async (h) => {
      try {
        await resend.emails.send({
          from: 'Rob & Alannah <hello@alannah-rob.ie>',
          to: h.contact_email as string,
          subject: 'Kind reminder: RSVP for Rob & Alannah wedding',
          html: buildReminderEmailHtml(h.display_name as string, `${baseUrl}/rsvp?token=${h.invite_token}`),
        });
        await sql`UPDATE households SET reminder_count = reminder_count + 1, last_reminder_at = now(), reminder_failed_count = 0, last_reminder_failed_at = NULL WHERE id = ${h.id}`;
      } catch (error) {
        await sql`UPDATE households SET reminder_failed_count = reminder_failed_count + 1, last_reminder_failed_at = now() WHERE id = ${h.id}`;
        throw error;
      }
    }));

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return NextResponse.redirect(new URL(`/dashboard?reminder=done&sent=${sent}&failed=${failed}`, request.url));
  }

  const password = formData.get('password');
  const nextPath = String(formData.get('next') ?? '/dashboard');
  if (typeof password !== 'string' || password !== process.env.ADMIN_SECRET) {
    return NextResponse.redirect(new URL('/dashboard?error=invalid_password', request.url));
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set(ADMIN_COOKIE_NAME, process.env.ADMIN_SECRET as string, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_WEEK_SECONDS,
  });
  return response;
}
