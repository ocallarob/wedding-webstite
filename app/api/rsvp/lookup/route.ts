import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../../src/lib/db';
import { checkRateLimit } from '../../../../src/lib/rateLimit';

export const dynamic = 'force-dynamic';

function normaliseQuery(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/\s+/g, ' ');
}

function foldSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function scoreMatch(query: string, label: string, addressLineOne: string, memberNames: string[]): number {
  const q = foldSearchText(query);
  let score = 0;
  const labelLc = foldSearchText(label);
  const addressLc = foldSearchText(addressLineOne);
  const namesLc = memberNames.map((n) => foldSearchText(n));

  if (labelLc === q || addressLc === q || namesLc.some((n) => n === q)) score += 100;
  if (labelLc.startsWith(q) || addressLc.startsWith(q) || namesLc.some((n) => n.startsWith(q))) score += 20;
  if (labelLc.includes(q) || addressLc.includes(q) || namesLc.some((n) => n.includes(q))) score += 5;
  return score;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const query = normaliseQuery(body?.query);
  const code = normaliseQuery(body?.code);
  const expectedCode = process.env.PAPER_RSVP_CODE?.trim();

  if (!expectedCode) {
    return NextResponse.json({ error: 'Paper RSVP lookup is not configured.' }, { status: 503 });
  }
  if (!code || code !== expectedCode) {
    return NextResponse.json({ error: 'Invalid access code.' }, { status: 403 });
  }
  if (query.length < 2) {
    return NextResponse.json({ error: 'Enter at least 2 characters.' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const allowed = await checkRateLimit(`rsvp:lookup:ip:${ip}`, { limit: 20, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const term = `%${foldSearchText(query)}%`;
  const rows = await sql`
    SELECT
      h.invite_token,
      h.label,
      h.address_line_one,
      array_agg(m.full_name ORDER BY m.sort_order, m.created_at) AS member_names
    FROM households h
    JOIN household_members m ON m.household_id = h.id
    WHERE h.is_paper_invite = true
      AND (
           translate(lower(m.full_name), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou') LIKE ${term}
       OR translate(lower(COALESCE(h.label, '')), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou') LIKE ${term}
       OR translate(lower(COALESCE(h.address_line_one, '')), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou') LIKE ${term}
      )
    GROUP BY h.id
    ORDER BY h.created_at DESC
    LIMIT 20
  `;

  const ranked = rows
    .map((row) => ({
      token: row.invite_token,
      label: row.label,
      address_line_one: row.address_line_one,
      member_names: Array.isArray(row.member_names) ? row.member_names : [],
      _score: scoreMatch(query, String(row.label ?? ''), String(row.address_line_one ?? ''), Array.isArray(row.member_names) ? row.member_names : []),
    }))
    .sort((a, b) => b._score - a._score);

  const best = ranked[0];
  if (!best) return NextResponse.json({ match: null });

  return NextResponse.json({
    match: {
      token: best.token,
      label: best.label,
      address_line_one: best.address_line_one,
      member_names: best.member_names,
    },
  });
}
