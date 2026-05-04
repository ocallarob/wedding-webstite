import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';

export const dynamic = 'force-dynamic';
const ADMIN_COOKIE_NAME = 'admin_session';
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret');
  const cookieSecret = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const isAuthorized = secret === process.env.ADMIN_SECRET || cookieSecret === process.env.ADMIN_SECRET;

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rows = await sql`
    SELECT
      g.id, g.name, g.partner_name, g.email, g.token, g.invited_at,
      r.attending_day1, r.attending_day2,
      r.partner_attending_day1, r.partner_attending_day2,
      r.dietary, r.partner_dietary, r.song, r.message, r.submitted_at
    FROM guests g
    LEFT JOIN rsvps r ON g.token = r.token
    ORDER BY g.name
  `;

  const anyAttending = (g: typeof rows[number]) =>
    g.attending_day1 || g.attending_day2 ||
    g.partner_attending_day1 || g.partner_attending_day2;

  const total       = rows.length;
  const invited     = rows.filter((g) => g.invited_at).length;
  const rsvpd_yes   = rows.filter((g) => g.submitted_at && anyAttending(g)).length;
  const rsvpd_no    = rows.filter((g) => g.submitted_at && !anyAttending(g)).length;
  const no_response = rows.filter((g) => g.invited_at && !g.submitted_at).length;

  return NextResponse.json({ total, invited, rsvpd_yes, rsvpd_no, no_response, guests: rows });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = formData.get('action');
  if (action === 'logout') {
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.cookies.delete(ADMIN_COOKIE_NAME);
    return response;
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

export async function DELETE(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  response.cookies.delete(ADMIN_COOKIE_NAME);
  return response;
}
