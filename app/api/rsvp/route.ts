import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';

export const dynamic = 'force-dynamic';

type DietaryValue = { options: string[]; other: string };

function normaliseDietary(input: unknown): DietaryValue {
  if (!input || typeof input !== 'object') return { options: [], other: '' };
  const source = input as { options?: unknown; other?: unknown };
  const options = Array.isArray(source.options) ? source.options.filter((v): v is string => typeof v === 'string') : [];
  const other = typeof source.other === 'string' ? source.other : '';
  return { options, other };
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const households = await sql`
    SELECT id, label, contact_email FROM households WHERE invite_token = ${token}
  `;
  if (!households[0]) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });

  const members = await sql`
    SELECT id, full_name, member_type, attending_day1, attending_day2, dietary, sort_order
    FROM household_members
    WHERE household_id = ${households[0].id}
    ORDER BY sort_order, created_at
  `;

  const rsvp = await sql`SELECT submitted_at FROM household_rsvps WHERE household_id = ${households[0].id}`;

  return NextResponse.json({
    household_id: households[0].id,
    label: households[0].label,
    contact_email: households[0].contact_email,
    already_rsvpd: rsvp.length > 0,
    members: members.map((m) => ({
      id: m.id,
      full_name: m.full_name,
      member_type: m.member_type,
      attending_day1: m.attending_day1,
      attending_day2: m.attending_day2,
      dietary: normaliseDietary(m.dietary),
    })),
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { token, members, song, message } = body as {
    token?: string;
    members?: Array<{ id: string; attending_day1: boolean; attending_day2: boolean; dietary?: unknown }>;
    song?: string;
    message?: string;
  };

  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  if (!Array.isArray(members) || members.length === 0) {
    return NextResponse.json({ error: 'members required' }, { status: 400 });
  }

  const households = await sql`SELECT id FROM households WHERE invite_token = ${token}`;
  if (!households[0]) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
  const householdId = households[0].id as string;

  for (const member of members) {
    const dietary = normaliseDietary(member.dietary);
    await sql`
      UPDATE household_members
      SET
        attending_day1 = ${!!member.attending_day1},
        attending_day2 = ${!!member.attending_day2},
        dietary = ${JSON.stringify(dietary)}::jsonb
      WHERE id = ${member.id} AND household_id = ${householdId}
    `;
  }

  await sql`
    INSERT INTO household_rsvps (household_id, song, message)
    VALUES (${householdId}, ${song || null}, ${message || null})
    ON CONFLICT (household_id) DO UPDATE SET
      song = EXCLUDED.song,
      message = EXCLUDED.message,
      submitted_at = now()
  `;

  return NextResponse.json({ ok: true });
}
