import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { sql } from '../../../../src/lib/db';
import { hasAdminAuth, isSameOriginRequest } from '../../../../src/lib/adminAuth';

export const dynamic = 'force-dynamic';

function buildEmailHtml(displayName: string, rsvpUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>You're invited</title>
</head>
<body style="margin:0;padding:0;background:#fdfbf7;font-family:Helvetica,Arial,sans-serif;color:#3a3530">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px">
    <div style="border:1px solid #e8e2da;border-radius:16px;padding:36px;background:#ffffff">
      <p style="margin:0 0 16px;font-size:15px">Dear ${displayName},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#3a3530">
        We would be so delighted to have you join us to celebrate our wedding weekend at the
        <strong>Lough Erne Resort, Co. Fermanagh</strong> on <strong>Friday, 28 August 2026</strong>.
      </p>
      <div style="text-align:center;margin-top:24px">
        <a href="${rsvpUrl}" style="display:inline-block;background:#dbb8b8;color:#3a3530;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase">RSVP Now</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

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
          from: 'Rob & Alannah <hello@alannah-rob.ie>',
          to: household.contact_email as string,
          subject: "You're invited — Rob & Alannah, 28 August 2026",
          html: buildEmailHtml(household.display_name as string, rsvpUrl),
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
