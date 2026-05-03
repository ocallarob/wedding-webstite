import { NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await sql`
    SELECT
      g.id, g.name, g.email, g.token, g.invited_at,
      r.attending_day1, r.attending_day2, r.dietary, r.song, r.message, r.submitted_at
    FROM guests g
    LEFT JOIN rsvps r ON g.token = r.token
    ORDER BY g.name
  `;

  const total       = rows.length;
  const invited     = rows.filter((g) => g.invited_at).length;
  const rsvpd_yes   = rows.filter((g) => g.submitted_at && (g.attending_day1 || g.attending_day2)).length;
  const rsvpd_no    = rows.filter((g) => g.submitted_at && !g.attending_day1 && !g.attending_day2).length;
  const no_response = rows.filter((g) => g.invited_at && !g.submitted_at).length;

  return NextResponse.json({ total, invited, rsvpd_yes, rsvpd_no, no_response, guests: rows });
}
