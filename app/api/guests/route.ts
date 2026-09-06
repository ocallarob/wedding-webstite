import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';
import { hasAdminAuth } from '../../../src/lib/adminAuth';

export const dynamic = 'force-dynamic';


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

