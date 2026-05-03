import { NextResponse } from 'next/server';
import { sql } from '../../../src/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await sql`SELECT * FROM guests ORDER BY name`;
  return NextResponse.json({ guests: rows });
}

export async function POST(request: Request) {
  const { name, email } = await request.json();
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'name and email required' }, { status: 400 });
  }

  const rows = await sql`
    INSERT INTO guests (name, email)
    VALUES (${name.trim()}, ${email.trim().toLowerCase()})
    ON CONFLICT (email) DO NOTHING
    RETURNING *
  `;

  if (!rows[0]) {
    return NextResponse.json({ error: 'A guest with that email already exists' }, { status: 409 });
  }
  return NextResponse.json({ guest: rows[0] }, { status: 201 });
}
