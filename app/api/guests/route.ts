import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';
import { hasAdminAuth, isSameOriginRequest } from '../../../src/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!hasAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT h.id, h.label, h.contact_email,
      COALESCE(json_agg(json_build_object('id', m.id, 'full_name', m.full_name, 'member_type', m.member_type, 'sort_order', m.sort_order)
      ORDER BY m.sort_order, m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]'::json) AS members
    FROM households h
    LEFT JOIN household_members m ON m.household_id = h.id
    GROUP BY h.id
    ORDER BY COALESCE(h.label, h.contact_email)
  `;

  return NextResponse.json({ households: rows });
}

export async function POST(request: NextRequest) {
  if (!hasAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const contactEmail = String(body.contact_email ?? '').trim().toLowerCase();
  const label = String(body.label ?? '').trim() || null;
  const members = Array.isArray(body.members) ? body.members : [];

  if (!contactEmail) return NextResponse.json({ error: 'contact_email required' }, { status: 400 });
  if (members.length === 0) return NextResponse.json({ error: 'at least one member required' }, { status: 400 });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(contactEmail)) return NextResponse.json({ error: 'invalid email address' }, { status: 400 });

  const inserted = await sql`
    INSERT INTO households (contact_email, label)
    VALUES (${contactEmail}, ${label})
    ON CONFLICT (contact_email) DO UPDATE SET label = EXCLUDED.label
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
