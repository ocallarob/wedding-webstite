import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { hasAdminAuth, isSameOriginRequest } from '../../../../src/lib/adminAuth';
import { buildReminderEmailHtml } from '../../../../src/lib/reminderEmailHtml';
import { validateReminderTestPayload } from '../../../../src/lib/reminderTestPayload';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!hasAdminAuth(request) || !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const validation = validateReminderTestPayload(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 503 });
  }

  const { to, displayName, eveningInvite, rsvpToken } = validation.payload;
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? request.nextUrl.origin).replace(/\/$/, '');
  const rsvpUrl = `${baseUrl}/rsvp?token=${encodeURIComponent(rsvpToken ?? 'example-reminder-test')}`;
  const subject = `[TEST] Kind reminder: RSVP for Alannah & Rob wedding`;

  try {
    const sendResult = await new Resend(apiKey).emails.send({
      from: 'Alannah & Rob <hello@alannah-rob.ie>',
      to,
      subject,
      html: buildReminderEmailHtml(displayName, rsvpUrl, baseUrl, eveningInvite),
    });

    if (sendResult.error || !sendResult.data?.id) {
      throw new Error(sendResult.error?.message ?? 'Resend did not return a message id');
    }

    return NextResponse.json({
      sent: true,
      id: sendResult.data.id,
      to,
      subject,
      rsvpUrl,
      note: 'Test sends do not update household reminder counters.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown reminder test failure';
    return NextResponse.json({ sent: false, error: message }, { status: 502 });
  }
}
