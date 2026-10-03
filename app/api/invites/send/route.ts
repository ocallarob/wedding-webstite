import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
  return NextResponse.json({ error: 'Invite email sending is disabled' }, { status: 410 });
}
