import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { sql } from '../../../../src/lib/db';
import { hasAdminAuth, isSameOriginRequest } from '../../../../src/lib/adminAuth';
import { buildInviteEmailHtml } from '../../../../src/lib/inviteEmailHtml';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!hasAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const allUninvited = await sql`
    SELECT h.id, h.invite_token, h.contact_email,
      COALESCE((
        SELECT string_agg(m.full_name, ' & ' ORDER BY m.sort_order, m.created_at)
        FROM household_members m
        WHERE m.household_id = h.id
      ), h.contact_email) as display_name
    FROM households h
    WHERE h.invited_at IS NULL
  `;

  if (allUninvited.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No uninvited households' });
  }

  const BATCH_LIMIT = 100;
  const households = allUninvited.slice(0, BATCH_LIMIT);
  const remaining = allUninvited.length - households.length;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie';

  const results = await Promise.allSettled(
    households.map(async (household) => {
      try {
        const rsvpUrl = `${baseUrl}/rsvp?token=${household.invite_token}`;
        await resend.emails.send({
          from: 'Alannah and Rob <hello@alannah-rob.ie>',
          to: household.contact_email as string,
          subject: "You're invited — Alannah and Rob, 28 August 2026",
          html: buildInviteEmailHtml(household.display_name as string, rsvpUrl, baseUrl),
        });

        await sql`
          UPDATE households
          SET invited_at = now(), invite_failed_count = 0, last_invite_failed_at = NULL
          WHERE id = ${household.id}
        `;
      } catch (error) {
        await sql`
          UPDATE households
          SET invite_failed_count = invite_failed_count + 1, last_invite_failed_at = now()
          WHERE id = ${household.id}
        `;
        throw error;
      }
    })
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  return NextResponse.json({
    sent,
    failed,
    ...(remaining > 0 && { remaining, note: `Run again to send the next ${remaining} invites` }),
  });
}
