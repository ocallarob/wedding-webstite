import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret');
  return secret && secret === process.env.ADMIN_SECRET;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rows = await sql`SELECT * FROM guests ORDER BY name`;
  return NextResponse.json({ guests: rows });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, email } = body;
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'name and email required' }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return NextResponse.json({ error: 'invalid email address' }, { status: 400 });
  }

  const partnerName = (body.partner_name as string | undefined)?.trim() || null;

  const rows = await sql`
    INSERT INTO guests (name, email, partner_name)
    VALUES (${name.trim()}, ${email.trim().toLowerCase()}, ${partnerName})
    ON CONFLICT (email) DO NOTHING
    RETURNING *
  `;

  if (!rows[0]) {
    return NextResponse.json({ error: 'A guest with that email already exists' }, { status: 409 });
  }
  return NextResponse.json({ guest: rows[0] }, { status: 201 });
}
