import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { sql } from '../../../../src/lib/db';
import { hasAdminAuth, isSameOriginRequest } from '../../../../src/lib/adminAuth';
import { buildInviteEmailHtml, buildInviteEmailSubject } from '../../../../src/lib/inviteEmailHtml';
import { runThrottledBatch } from '../../../../src/lib/throttledBatch';

export const dynamic = 'force-dynamic';
const SENDS_PER_SECOND = 5;
const SEND_INTERVAL_MS = Math.ceil(1000 / SENDS_PER_SECOND);

export async function POST(request: NextRequest) {
  if (!hasAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const allUninvited = await sql`
    SELECT h.id, h.invite_token, h.contact_email, h.evening_invite,
      COALESCE((
        SELECT string_agg(m.full_name, ' & ' ORDER BY m.sort_order, m.created_at)
        FROM household_members m
        WHERE m.household_id = h.id
      ), h.contact_email) as display_name
    FROM households h
    WHERE h.invited_at IS NULL
      AND h.is_paper_invite = false
      AND h.contact_email IS NOT NULL
  `;

  if (allUninvited.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No uninvited households' });
  }

  const BATCH_LIMIT = 100;
  const households = allUninvited.slice(0, BATCH_LIMIT);
  const remaining = allUninvited.length - households.length;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie';

  const { sent, failed } = await runThrottledBatch({
    items: households,
    intervalMs: SEND_INTERVAL_MS,
    runItem: async (household) => {
      try {
        const rsvpUrl = `${baseUrl}/rsvp?token=${household.invite_token}`;
        const sendResult = await resend.emails.send({
          from: 'Alannah & Rob <hello@alannah-rob.ie>',
          to: household.contact_email as string,
          subject: buildInviteEmailSubject(household.evening_invite === true),
          html: buildInviteEmailHtml(household.display_name as string, rsvpUrl, baseUrl, household.evening_invite === true),
        });
        if (sendResult.error || !sendResult.data?.id) {
          throw new Error(sendResult.error?.message ?? 'Resend did not return a message id');
        }

        await sql`
          UPDATE households
          SET invited_at = now(), invite_failed_count = 0, last_invite_failed_at = NULL, last_invite_error = NULL
          WHERE id = ${household.id}
        `;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown invite send failure';
        await sql`
          UPDATE households
          SET invite_failed_count = invite_failed_count + 1, last_invite_failed_at = now(), last_invite_error = ${message}
          WHERE id = ${household.id}
        `;
        throw error;
      }
    },
  });

  return NextResponse.json({
    sent,
    failed,
    ...(remaining > 0 && { remaining, note: `Run again to send the next ${remaining} invites` }),
  });
}
