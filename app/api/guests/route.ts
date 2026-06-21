import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';
import { hasAdminAuth, isSameOriginRequest } from '../../../src/lib/adminAuth';

export const dynamic = 'force-dynamic';

function parseBooleanFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
}

export async function GET(request: NextRequest) {
  if (!hasAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT h.id, h.label, h.contact_email, h.address_line_one, h.evening_invite, h.is_paper_invite,
      COALESCE(json_agg(json_build_object('id', m.id, 'full_name', m.full_name, 'member_type', m.member_type, 'sort_order', m.sort_order)
      ORDER BY m.sort_order, m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]'::json) AS members
    FROM households h
    LEFT JOIN household_members m ON m.household_id = h.id
    GROUP BY h.id
    ORDER BY COALESCE(h.label, h.contact_email, h.address_line_one)
  `;

  return NextResponse.json({ households: rows });
}

export async function POST(request: NextRequest) {
  if (!hasAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const contactEmail = String(body.contact_email ?? '').trim().toLowerCase();
  const addressLineOne = String(body.address_line_one ?? '').trim();
  const label = String(body.label ?? '').trim() || null;
  const eveningInvite = parseBooleanFlag(body.evening_invite);
  const isPaperInvite = Boolean(body.is_paper_invite);
  const members = Array.isArray(body.members) ? body.members : [];

  if (!isPaperInvite && !contactEmail) return NextResponse.json({ error: 'contact_email required' }, { status: 400 });
  if (isPaperInvite && !contactEmail && !addressLineOne) {
    return NextResponse.json({ error: 'address_line_one required for paper invites without email' }, { status: 400 });
  }
  if (members.length === 0) return NextResponse.json({ error: 'at least one member required' }, { status: 400 });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (contactEmail && !emailRegex.test(contactEmail)) return NextResponse.json({ error: 'invalid email address' }, { status: 400 });

  const existing = contactEmail
    ? await sql`SELECT id FROM households WHERE contact_email = ${contactEmail} LIMIT 1`
    : await sql`
        SELECT id
        FROM households
        WHERE is_paper_invite = true
          AND lower(address_line_one) = lower(${addressLineOne})
        LIMIT 1
      `;

  const inserted = existing.length > 0
    ? await sql`
        UPDATE households
        SET contact_email = ${contactEmail || null},
          address_line_one = ${addressLineOne || null},
          label = ${label},
          evening_invite = ${eveningInvite},
          is_paper_invite = ${isPaperInvite}
        WHERE id = ${existing[0].id}
        RETURNING id
      `
    : await sql`
        INSERT INTO households (contact_email, address_line_one, label, evening_invite, is_paper_invite)
        VALUES (${contactEmail || null}, ${addressLineOne || null}, ${label}, ${eveningInvite}, ${isPaperInvite})
        RETURNING id
      `;

  const householdId = inserted[0].id as string;
  await sql`DELETE FROM household_members WHERE household_id = ${householdId}`;

  for (let i = 0; i < members.length; i += 1) {
    const raw = members[i] as { full_name?: string; member_type?: string };
    const fullName = String(raw.full_name ?? '').trim();
    if (!fullName) continue;
    const memberType = raw.member_type === 'child' ? 'child' : 'adult';
    await sql`
      INSERT INTO household_members (household_id, full_name, member_type, dietary, sort_order)
      VALUES (${householdId}, ${fullName}, ${memberType}, ${JSON.stringify({ options: [], other: '' })}::jsonb, ${i})
    `;
  }

  return NextResponse.json({ ok: true, household_id: householdId }, { status: 201 });
}
