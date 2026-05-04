import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';
import { checkRateLimit } from '../../../src/lib/rateLimit';

export const dynamic = 'force-dynamic';

type DietaryValue = { options: string[]; other: string };
type RsvpMemberInput = { id: string; attending_day1: boolean; attending_day2: boolean; dietary?: unknown };

const MAX_SONG_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_MEMBERS_PER_SUBMISSION = 16;

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
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  const ipAllowed = await checkRateLimit(`rsvp:get:ip:${ip}`, { limit: 120, windowSeconds: 60 });
  const tokenAllowed = await checkRateLimit(`rsvp:get:token:${token}`, { limit: 60, windowSeconds: 60 });
  if (!ipAllowed || !tokenAllowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

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
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  const { token, members, song, message } = body as {
    token?: string;
    members?: RsvpMemberInput[];
    song?: string;
    message?: string;
  };

  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  const ipAllowed = await checkRateLimit(`rsvp:post:ip:${ip}`, { limit: 30, windowSeconds: 60 });
  const tokenAllowed = await checkRateLimit(`rsvp:post:token:${token}`, { limit: 15, windowSeconds: 60 });
  if (!ipAllowed || !tokenAllowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  if (!Array.isArray(members) || members.length === 0 || members.length > MAX_MEMBERS_PER_SUBMISSION) {
    return NextResponse.json({ error: 'members required' }, { status: 400 });
  }
  const normalisedSong = typeof song === 'string' ? song.trim() : '';
  const normalisedMessage = typeof message === 'string' ? message.trim() : '';
  if (normalisedSong.length > MAX_SONG_LENGTH) {
    return NextResponse.json({ error: 'song too long' }, { status: 400 });
  }
  if (normalisedMessage.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: 'message too long' }, { status: 400 });
  }

  const households = await sql`SELECT id FROM households WHERE invite_token = ${token}`;
  if (!households[0]) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
  const householdId = households[0].id as string;

  const allowedMembers = await sql`
    SELECT id FROM household_members WHERE household_id = ${householdId}
  `;
  const allowedMemberIds = new Set(allowedMembers.map((m) => String(m.id)));
  const seen = new Set<string>();

  for (const member of members) {
    if (!member || typeof member !== 'object') {
      return NextResponse.json({ error: 'invalid member payload' }, { status: 400 });
    }
    if (typeof member.id !== 'string' || !allowedMemberIds.has(member.id) || seen.has(member.id)) {
      return NextResponse.json({ error: 'invalid member id' }, { status: 400 });
    }
    if (typeof member.attending_day1 !== 'boolean' || typeof member.attending_day2 !== 'boolean') {
      return NextResponse.json({ error: 'invalid attendance values' }, { status: 400 });
    }
    seen.add(member.id);
    const dietary = normaliseDietary(member.dietary);
    await sql`
      UPDATE household_members
      SET
        attending_day1 = ${member.attending_day1},
        attending_day2 = ${member.attending_day2},
        dietary = ${JSON.stringify(dietary)}::jsonb
      WHERE id = ${member.id} AND household_id = ${householdId}
    `;
  }

  await sql`
    INSERT INTO household_rsvps (household_id, song, message)
    VALUES (${householdId}, ${normalisedSong || null}, ${normalisedMessage || null})
    ON CONFLICT (household_id) DO UPDATE SET
      song = EXCLUDED.song,
      message = EXCLUDED.message,
      submitted_at = now()
  `;

  return NextResponse.json({ ok: true });
}
