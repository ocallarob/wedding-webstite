import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';
import { allowRsvpGet, allowRsvpPost } from '../../../src/lib/rsvpRateLimit';
import { validateRsvpPayload } from '../../../src/lib/rsvpValidation';

export const dynamic = 'force-dynamic';

type DietaryValue = { options: string[]; other: string };
let rsvpOpenTrackingAvailable = true;

function normaliseDietary(input: unknown): DietaryValue {
  if (!input || typeof input !== 'object') return { options: [], other: '' };
  const source = input as { options?: unknown; other?: unknown };
  const options = Array.isArray(source.options) ? source.options.filter((v): v is string => typeof v === 'string') : [];
  const other = typeof source.other === 'string' ? source.other : '';
  return { options, other };
}

async function trackRsvpOpen(request: NextRequest, householdId: string) {
  if (!rsvpOpenTrackingAvailable) return;

  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || null;
  const userAgent = request.headers.get('user-agent');

  try {
    await sql`
      INSERT INTO household_rsvp_opens (household_id, ip_address, user_agent)
      VALUES (${householdId}, ${ip}, ${userAgent || null})
    `;
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === '42P01') {
      rsvpOpenTrackingAvailable = false;
    }

    // Tracking is best-effort only and should never block RSVP access.
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (!(await allowRsvpGet(ip, token))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const households = await sql`
    SELECT id, label, contact_email, evening_invite FROM households WHERE invite_token = ${token}
  `;
  if (!households[0]) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
  const householdId = String(households[0].id);

  await trackRsvpOpen(request, householdId);

  const members = await sql`
    SELECT id, full_name, member_type, attending_day1, attending_day2, dietary, sort_order
    FROM household_members
    WHERE household_id = ${householdId}
    ORDER BY sort_order, created_at
  `;

  const rsvp = await sql`
    SELECT submitted_at, song, message
    FROM household_rsvps
    WHERE household_id = ${householdId}
  `;

  return NextResponse.json({
    household_id: householdId,
    label: households[0].label,
    contact_email: households[0].contact_email,
    evening_invite: households[0].evening_invite === true,
    already_rsvpd: rsvp.length > 0,
    song: (rsvp[0]?.song as string | null) ?? '',
    message: (rsvp[0]?.message as string | null) ?? '',
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
  const parsed = validateRsvpPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { token, members, normalisedSong, normalisedMessage } = parsed;

  if (!(await allowRsvpPost(ip, token))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
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
