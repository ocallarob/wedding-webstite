import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const rows = await sql`SELECT name FROM guests WHERE token = ${token}`;
  if (!rows[0]) {
    return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
  }

  const rsvps = await sql`SELECT token FROM rsvps WHERE token = ${token}`;
  return NextResponse.json({ name: rows[0].name, already_rsvpd: rsvps.length > 0 });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { token, attending_day1, attending_day2, dietary, song, message } = body;

  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const rows = await sql`SELECT id FROM guests WHERE token = ${token}`;
  if (!rows[0]) {
    return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
  }

  await sql`
    INSERT INTO rsvps (token, attending_day1, attending_day2, dietary, song, message)
    VALUES (
      ${token},
      ${attending_day1 ?? false},
      ${attending_day2 ?? false},
      ${dietary || null},
      ${song || null},
      ${message || null}
    )
    ON CONFLICT (token) DO UPDATE SET
      attending_day1 = EXCLUDED.attending_day1,
      attending_day2 = EXCLUDED.attending_day2,
      dietary        = EXCLUDED.dietary,
      song           = EXCLUDED.song,
      message        = EXCLUDED.message,
      submitted_at   = now()
  `;

  return NextResponse.json({ ok: true });
}
