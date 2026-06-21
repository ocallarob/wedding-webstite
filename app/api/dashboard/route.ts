import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { sql } from '../../../src/lib/db';
import { ADMIN_COOKIE_NAME, hasAdminAuth, isSameOriginRequest } from '../../../src/lib/adminAuth';
import { createAdminSessionToken, SESSION_TTL_SECONDS } from '../../../src/lib/adminSession';
import { verifyCsrfToken } from '../../../src/lib/csrf';
import { buildInviteEmailHtml } from '../../../src/lib/inviteEmailHtml';
import { buildReminderEmailHtml } from '../../../src/lib/reminderEmailHtml';
import { runThrottledBatch } from '../../../src/lib/throttledBatch';

export const dynamic = 'force-dynamic';
const REMINDER_BATCH_LIMIT = 100;
const SENDS_PER_SECOND = 5;
const SEND_INTERVAL_MS = Math.ceil(1000 / SENDS_PER_SECOND);

export async function GET(request: NextRequest) {
  if (!hasAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const households = await sql`
    SELECT
      h.id, h.label, h.contact_email, h.address_line_one, h.is_paper_invite, h.invited_at,
      h.invite_failed_count, h.reminder_count, h.reminder_failed_count,
      hr.song, hr.message, hr.submitted_at,
      COALESCE(ho.open_count, 0) AS open_count,
      ho.first_opened_at,
      ho.last_opened_at,
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
    ORDER BY COALESCE(h.label, h.contact_email, h.address_line_one)
  `;

  const anyAttending = (members: any[]) => members.some((m) => m.attending_day1 || m.attending_day2);
  const total = households.length;
  const invited = households.filter((h) => h.invited_at || h.is_paper_invite).length;
  const rsvpd_yes = households.filter((h) => h.submitted_at && anyAttending(h.members as any[])).length;
  const rsvpd_no = households.filter((h) => h.submitted_at && !anyAttending(h.members as any[])).length;
  const no_response = households.filter((h) => (h.invited_at || h.is_paper_invite) && !h.submitted_at).length;
  const opened = households.filter((h) => Number(h.open_count ?? 0) > 0).length;

  return NextResponse.json({ total, invited, opened, rsvpd_yes, rsvpd_no, no_response, households });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = formData.get('action');
  const adminSecret = process.env.ADMIN_SECRET;
  const sessionToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const csrfToken = String(formData.get('csrf_token') ?? '');
  const csrfValid = !!adminSecret && verifyCsrfToken(csrfToken, sessionToken, adminSecret);

  if (action === 'logout') {
    if (!hasAdminAuth(request) || !csrfValid) {
      return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));
    }
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.cookies.delete({ name: ADMIN_COOKIE_NAME, path: '/' });
    return response;
  }

  if (!adminSecret) {
    return NextResponse.redirect(new URL('/dashboard?error=missing_admin_secret', request.url));
  }

  if (action === 'send_reminders') {
    if (!hasAdminAuth(request)) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));
    if (!isSameOriginRequest(request)) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));
    if (!csrfValid) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));

    const resend = new Resend(process.env.RESEND_API_KEY);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie';

    const rows = await sql`
      SELECT h.id, h.invite_token, h.contact_email,
        COALESCE((SELECT string_agg(m.full_name, ' & ' ORDER BY m.sort_order, m.created_at) FROM household_members m WHERE m.household_id = h.id), h.contact_email) as display_name
      FROM households h
      LEFT JOIN household_rsvps hr ON hr.household_id = h.id
      WHERE h.invited_at IS NOT NULL
        AND h.is_paper_invite = false
        AND h.contact_email IS NOT NULL
        AND hr.household_id IS NULL
      ORDER BY COALESCE(h.label, h.contact_email)
      LIMIT ${REMINDER_BATCH_LIMIT}
    `;

    if (rows.length === 0) return NextResponse.redirect(new URL('/dashboard?reminder=none', request.url));

    const { sent, failed } = await runThrottledBatch({
      items: rows,
      intervalMs: SEND_INTERVAL_MS,
      runItem: async (h) => {
        try {
          const sendResult = await resend.emails.send({
            from: 'Alannah & Rob <hello@alannah-rob.ie>',
            to: h.contact_email as string,
            subject: 'Kind reminder: RSVP for Alannah & Rob wedding',
            html: buildReminderEmailHtml(h.display_name as string, `${baseUrl}/rsvp?token=${h.invite_token}`, baseUrl),
          });
          if (sendResult.error || !sendResult.data?.id) {
            throw new Error(sendResult.error?.message ?? 'Resend did not return a message id');
          }
          await sql`UPDATE households SET reminder_count = reminder_count + 1, last_reminder_at = now(), reminder_failed_count = 0, last_reminder_failed_at = NULL WHERE id = ${h.id}`;
        } catch (error) {
          await sql`UPDATE households SET reminder_failed_count = reminder_failed_count + 1, last_reminder_failed_at = now() WHERE id = ${h.id}`;
          throw error;
        }
      },
    });
    return NextResponse.redirect(new URL(`/dashboard?reminder=done&sent=${sent}&failed=${failed}`, request.url));
  }

  if (action === 'resend_invite') {
    if (!hasAdminAuth(request)) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));
    if (!isSameOriginRequest(request)) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));
    if (!csrfValid) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));

    const householdId = String(formData.get('household_id') ?? '').trim();
    if (!householdId) return NextResponse.redirect(new URL('/dashboard?resend=failed', request.url));

    const resend = new Resend(process.env.RESEND_API_KEY);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie';
    const rows = await sql`
      SELECT h.id, h.invite_token, h.contact_email,
        COALESCE((
          SELECT string_agg(m.full_name, ' & ' ORDER BY m.sort_order, m.created_at)
          FROM household_members m
          WHERE m.household_id = h.id
        ), h.contact_email) as display_name
      FROM households h
      WHERE h.id = ${householdId}
        AND h.is_paper_invite = false
        AND h.contact_email IS NOT NULL
      LIMIT 1
    `;
    const household = rows[0];
    if (!household) return NextResponse.redirect(new URL('/dashboard?resend=failed', request.url));

    try {
      const rsvpUrl = `${baseUrl}/rsvp?token=${household.invite_token}`;
      const sendResult = await resend.emails.send({
        from: 'Alannah & Rob <hello@alannah-rob.ie>',
        to: household.contact_email as string,
        subject: "You're invited — Alannah & Rob, 28 August 2026",
        html: buildInviteEmailHtml(household.display_name as string, rsvpUrl, baseUrl),
      });
      if (sendResult.error || !sendResult.data?.id) {
        throw new Error(sendResult.error?.message ?? 'Resend did not return a message id');
      }
      await sql`
        UPDATE households
        SET invited_at = COALESCE(invited_at, now()), invite_failed_count = 0, last_invite_failed_at = NULL, last_invite_error = NULL
        WHERE id = ${household.id}
      `;
      return NextResponse.redirect(new URL('/dashboard?resend=done', request.url));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown invite send failure';
      await sql`
        UPDATE households
        SET invite_failed_count = invite_failed_count + 1, last_invite_failed_at = now(), last_invite_error = ${message}
        WHERE id = ${household.id}
      `;
      return NextResponse.redirect(new URL('/dashboard?resend=failed', request.url));
    }
  }

  const password = formData.get('password');
  const nextPath = String(formData.get('next') ?? '/dashboard');
  if (typeof password !== 'string' || password !== adminSecret) {
    return NextResponse.redirect(new URL('/dashboard?error=invalid_password', request.url));
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionToken(adminSecret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
