import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';
import { ADMIN_COOKIE_NAME, hasAdminAuth, isSameOriginRequest } from '../../../src/lib/adminAuth';
import { createAdminSessionToken, SESSION_TTL_SECONDS } from '../../../src/lib/adminSession';
import { verifyCsrfToken } from '../../../src/lib/csrf';

export const dynamic = 'force-dynamic';

function dashboardRedirect(request: NextRequest, path: string, error: string): NextResponse {
  const url = new URL(path, request.url);
  url.searchParams.set('error', error);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  if (!hasAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const households = await sql`
    SELECT
      h.id, h.label, h.contact_email, h.address_line_one, h.evening_invite, h.is_paper_invite, h.invited_at,
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
  const nextPath = formData.get('next') === '/dashboard/gallery' ? '/dashboard/gallery' : '/dashboard';
  const adminSecret = process.env.ADMIN_SECRET;
  const sessionToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const csrfToken = String(formData.get('csrf_token') ?? '');
  const csrfValid = !!adminSecret && verifyCsrfToken(csrfToken, sessionToken, adminSecret);

  if (action === 'logout') {
    if (!hasAdminAuth(request) || !isSameOriginRequest(request) || !csrfValid) {
      return dashboardRedirect(request, '/dashboard', 'unauthorized');
    }
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.cookies.delete({ name: ADMIN_COOKIE_NAME, path: '/' });
    return response;
  }

  if (action !== null) {
    return NextResponse.json({ error: 'Unsupported dashboard action' }, { status: 405 });
  }

  if (!adminSecret) return dashboardRedirect(request, nextPath, 'missing_admin_secret');

  const password = formData.get('password');
  if (typeof password !== 'string' || password !== adminSecret) {
    return dashboardRedirect(request, nextPath, 'invalid_password');
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
