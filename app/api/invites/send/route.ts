import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { sql } from '../../../../src/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = request.headers.get('x-admin-secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const allUninvited = await sql`
    SELECT id, name, partner_name, email, token FROM guests WHERE invited_at IS NULL
  `;

  if (allUninvited.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No uninvited guests' });
  }

  const BATCH_LIMIT = 100;
  const guests = allUninvited.slice(0, BATCH_LIMIT);
  const remaining = allUninvited.length - guests.length;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie';

  const results = await Promise.allSettled(
    guests.map(async (guest) => {
      const rsvpUrl = `${baseUrl}/rsvp?token=${guest.token}`;
      const displayName = guest.partner_name
        ? `${guest.name} & ${guest.partner_name}`
        : guest.name as string;

      await resend.emails.send({
        from: 'Rob & Alannah <hello@alannah-rob.ie>',
        to: guest.email as string,
        subject: "You're invited — Rob & Alannah, 28 August 2026",
        html: buildEmailHtml(displayName, rsvpUrl),
      });

      await sql`UPDATE guests SET invited_at = now() WHERE id = ${guest.id}`;
    })
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  return NextResponse.json({
    sent,
    failed,
    ...(remaining > 0 && { remaining, note: `Run again tomorrow to send the next ${remaining} invites` }),
  });
}

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

    <div style="text-align:center;margin-bottom:32px">
      <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#9c7a8c">
        28 August 2026 &nbsp;·&nbsp; Lough Erne Resort
      </p>
      <h1 style="margin:12px 0 0;font-family:Georgia,serif;font-weight:300;font-size:38px;letter-spacing:0.1em;color:#3a3530">
        Rob &amp; Alannah
      </h1>
      <p style="margin:8px 0 0;font-family:Georgia,serif;font-style:italic;font-size:16px;color:#9c7a8c">
        Le grá agus le háthas
      </p>
    </div>

    <div style="border:1px solid #e8e2da;border-radius:16px;padding:36px;background:#ffffff">
      <p style="margin:0 0 16px;font-size:15px">Dear ${displayName},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#3a3530">
        We would be so delighted to have you join us to celebrate our wedding weekend at the
        <strong>Lough Erne Resort, Co. Fermanagh</strong> on <strong>Friday, 28 August 2026</strong>.
      </p>
      <p style="margin:0 0 32px;font-size:15px;line-height:1.75;color:#3a3530">
        Please let us know if you can make it — we truly hope you can.
      </p>

      <div style="text-align:center">
        <a href="${rsvpUrl}"
           style="display:inline-block;background:#dbb8b8;color:#3a3530;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase">
          RSVP Now
        </a>
      </div>

      <p style="margin:28px 0 0;font-size:12px;color:#7a756f;text-align:center">
        Kindly respond by 1 August 2026
      </p>
    </div>

    <p style="margin-top:32px;text-align:center;font-size:12px;color:#9c7a8c;letter-spacing:0.15em">
      A &nbsp;◇&nbsp; R
    </p>
  </div>
</body>
</html>`;
}
