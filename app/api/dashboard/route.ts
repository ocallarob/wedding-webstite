import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { sql } from '../../../src/lib/db';
import { ADMIN_COOKIE_NAME, hasAdminAuth, isSameOriginRequest } from '../../../src/lib/adminAuth';
import { createAdminSessionToken, SESSION_TTL_SECONDS } from '../../../src/lib/adminSession';
import { verifyCsrfToken } from '../../../src/lib/csrf';
import { buildInviteEmailHtml } from '../../../src/lib/inviteEmailHtml';
import { runThrottledBatch } from '../../../src/lib/throttledBatch';

export const dynamic = 'force-dynamic';
const REMINDER_BATCH_LIMIT = 100;
const SENDS_PER_SECOND = 5;
const SEND_INTERVAL_MS = Math.ceil(1000 / SENDS_PER_SECOND);

function buildReminderEmailHtml(displayName: string, rsvpUrl: string, baseUrl: string, eveningInvite = false): string {
  const assetBase = baseUrl.replace(/\/$/, '');
  const eventLine = eveningInvite ? 'for our evening reception' : 'for our wedding weekend';
  const detailLine = eveningInvite
    ? 'Dear ' + displayName + ', if you have a moment, we&rsquo;d be so grateful for your evening reception RSVP.'
    : 'Dear ' + displayName + ', if you have a moment, we&rsquo;d be so grateful for your RSVP.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>RSVP reminder</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Charmonman:wght@400;700&family=Cormorant+Garamond:wght@300;400;500;600&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:24px 12px;background:#fdfbf7;font-family:'Jost',Arial,sans-serif;color:#3a3530">
  <div style="max-width:620px;margin:0 auto;border:1px solid #e8e2da;background:#fdfbf7;box-shadow:0 20px 56px rgba(58,53,48,0.08);border-radius:18px;overflow:hidden">
    <div style="padding:34px 34px 30px;text-align:center;background:radial-gradient(circle at top,rgba(219,184,184,0.16),transparent 52%),radial-gradient(circle at 85% 20%,rgba(143,168,136,0.1),transparent 42%)">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:12px;border-collapse:collapse">
        <tr>
          <td width="33.33%" align="left" valign="top">
            <img src="${assetBase}/assets/menlo-castle-rsvp.png" width="78" alt="" style="display:block;border:0;outline:none;text-decoration:none;opacity:0.7">
          </td>
          <td width="33.33%" align="center" valign="top">
            <p style="margin:2px 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;letter-spacing:0.16em;color:#9c7a8c">A ◇ R</p>
          </td>
          <td width="33.33%" align="right" valign="top">&nbsp;</td>
        </tr>
      </table>

      <p style="margin:0;font-family:'Charmonman','Brush Script MT','Segoe Script',cursive;font-size:18px;line-height:1.1;color:#8fa888;font-weight:400">
        just a gentle reminder
      </p>
      <h1 style="margin:9px 0 0;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:60px;line-height:0.94;font-weight:400;letter-spacing:0.01em;color:#9c7a8c">
        Alannah & Rob
      </h1>
      <p style="margin:5px 0 0;font-family:'Charmonman','Brush Script MT','Segoe Script',cursive;font-size:24px;line-height:1.02;color:#dbb8b8;font-weight:400">
        ${eventLine}
      </p>
      <p style="margin:1px 0 0;font-family:'Charmonman','Brush Script MT','Segoe Script',cursive;font-size:23px;line-height:1.01;color:#dbb8b8;font-weight:400">
        we&rsquo;d love to hear from you
      </p>
      <div style="margin:8px auto 5px;max-width:430px;height:1px;background:#d9d2c9;opacity:0.75"></div>
      <p style="margin:14px 0 0;font-family:'Jost',Arial,sans-serif;font-size:11px;line-height:1.2;letter-spacing:0.28em;text-transform:uppercase;color:#7a756f">
        Friday, 28 August 2026
      </p>
      <p style="margin:6px 0 0;font-family:'Jost',Arial,sans-serif;font-size:13px;line-height:1.4;color:#7a756f;letter-spacing:0.12em;text-transform:uppercase">
        Co. Fermanagh
      </p>
      <p style="margin:15px 0 0;font-family:'Jost',Arial,sans-serif;font-size:15px;line-height:1.68;color:#3a3530">
        ${detailLine}
      </p>

      <div style="text-align:center;margin-top:16px">
        <a href="${rsvpUrl}" style="display:inline-block;background:#dbb8b8;border:1px solid #dbb8b8;color:#3a3530;text-decoration:none;padding:12px 30px;border-radius:999px;font-family:'Jost',Arial,sans-serif;font-size:11px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase">
          RSVP Now
        </a>
      </div>
      <p style="margin:12px 0 0;font-family:'Jost',Arial,sans-serif;font-size:12px;line-height:1.5;color:#7a756f;text-align:center">
        If the button does not work, use this link:<br>
        <a href="${rsvpUrl}" style="color:#9c7a8c">Open your RSVP link</a>
      </p>
      <p style="margin:14px 0 0;font-size:12px;color:#7a756f;text-align:center">
        Kindly respond by 1 August 2026
      </p>

      <div style="text-align:right;margin-top:15px">
        <img src="${assetBase}/assets/devenish-tower-rsvp.png" width="108" alt="" style="display:inline-block;border:0;outline:none;text-decoration:none;opacity:0.75">
      </div>

    </div>
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  if (!hasAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const households = await sql`
    SELECT
      h.id, h.label, h.contact_email, h.address_line_one, h.evening_invite, h.is_paper_invite, h.invited_at,
      h.invite_failed_count, h.reminder_count, h.reminder_failed_count,
      hr.song, hr.message, hr.submitted_at,
      COALESCE(ho.open_count, 0) AS open_count,
      ho.first_opened_at,
      ho.last_opened_at,
      COALESCE(json_agg(json_build_object(
        'id', m.id,
        'full_name', m.full_name,
        'member_type', m.member_type,
        'attending_day1', m.attending_day1,
        'attending_day2', m.attending_day2,
        'dietary', m.dietary,
        'sort_order', m.sort_order
      ) ORDER BY m.sort_order, m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]'::json) AS members
    FROM households h
    LEFT JOIN household_members m ON m.household_id = h.id
    LEFT JOIN household_rsvps hr ON hr.household_id = h.id
    LEFT JOIN (
      SELECT
        household_id,
        COUNT(*)::int AS open_count,
        MIN(opened_at) AS first_opened_at,
        MAX(opened_at) AS last_opened_at
      FROM household_rsvp_opens
      GROUP BY household_id
    ) ho ON ho.household_id = h.id
    GROUP BY h.id, hr.song, hr.message, hr.submitted_at, ho.open_count, ho.first_opened_at, ho.last_opened_at
    ORDER BY COALESCE(h.label, h.contact_email, h.address_line_one)
  `;

  const anyAttending = (members: any[]) => members.some((m) => m.attending_day1 || m.attending_day2);
  const total = households.length;
  const invited = households.filter((h) => h.invited_at || h.is_paper_invite).length;
  const rsvpd_yes = households.filter((h) => h.submitted_at && anyAttending(h.members as any[])).length;
  const rsvpd_no = households.filter((h) => h.submitted_at && !anyAttending(h.members as any[])).length;
  const no_response = households.filter((h) => (h.invited_at || h.is_paper_invite) && !h.submitted_at).length;
  const opened = households.filter((h) => Number(h.open_count ?? 0) > 0).length;

  return NextResponse.json({ total, invited, opened, rsvpd_yes, rsvpd_no, no_response, households });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = formData.get('action');
  const adminSecret = process.env.ADMIN_SECRET;
  const sessionToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const csrfToken = String(formData.get('csrf_token') ?? '');
  const csrfValid = !!adminSecret && verifyCsrfToken(csrfToken, sessionToken, adminSecret);

  if (action === 'logout') {
    if (!hasAdminAuth(request) || !csrfValid) {
      return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));
    }
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.cookies.delete({ name: ADMIN_COOKIE_NAME, path: '/' });
    return response;
  }

  if (!adminSecret) {
    return NextResponse.redirect(new URL('/dashboard?error=missing_admin_secret', request.url));
  }

  if (action === 'send_reminders') {
    if (!hasAdminAuth(request)) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));
    if (!isSameOriginRequest(request)) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));
    if (!csrfValid) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));

    const resend = new Resend(process.env.RESEND_API_KEY);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie';

    const rows = await sql`
      SELECT h.id, h.invite_token, h.contact_email, h.evening_invite,
        COALESCE((SELECT string_agg(m.full_name, ' & ' ORDER BY m.sort_order, m.created_at) FROM household_members m WHERE m.household_id = h.id), h.contact_email) as display_name
      FROM households h
      LEFT JOIN household_rsvps hr ON hr.household_id = h.id
      WHERE h.invited_at IS NOT NULL
        AND h.is_paper_invite = false
        AND h.contact_email IS NOT NULL
        AND hr.household_id IS NULL
      ORDER BY COALESCE(h.label, h.contact_email)
      LIMIT ${REMINDER_BATCH_LIMIT}
    `;

    if (rows.length === 0) return NextResponse.redirect(new URL('/dashboard?reminder=none', request.url));

    const { sent, failed } = await runThrottledBatch({
      items: rows,
      intervalMs: SEND_INTERVAL_MS,
      runItem: async (h) => {
        try {
          const sendResult = await resend.emails.send({
            from: 'Alannah & Rob <hello@alannah-rob.ie>',
            to: h.contact_email as string,
            subject: 'Kind reminder: RSVP for Alannah & Rob wedding',
            html: buildReminderEmailHtml(
              h.display_name as string,
              `${baseUrl}/rsvp?token=${h.invite_token}`,
              baseUrl,
              h.evening_invite === true,
            ),
          });
          if (sendResult.error || !sendResult.data?.id) {
            throw new Error(sendResult.error?.message ?? 'Resend did not return a message id');
          }
          await sql`UPDATE households SET reminder_count = reminder_count + 1, last_reminder_at = now(), reminder_failed_count = 0, last_reminder_failed_at = NULL WHERE id = ${h.id}`;
        } catch (error) {
          await sql`UPDATE households SET reminder_failed_count = reminder_failed_count + 1, last_reminder_failed_at = now() WHERE id = ${h.id}`;
          throw error;
        }
      },
    });
    return NextResponse.redirect(new URL(`/dashboard?reminder=done&sent=${sent}&failed=${failed}`, request.url));
  }

  if (action === 'resend_invite') {
    if (!hasAdminAuth(request)) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));
    if (!isSameOriginRequest(request)) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));
    if (!csrfValid) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));

    const householdId = String(formData.get('household_id') ?? '').trim();
    if (!householdId) return NextResponse.redirect(new URL('/dashboard?resend=failed', request.url));

    const resend = new Resend(process.env.RESEND_API_KEY);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie';
    const rows = await sql`
      SELECT h.id, h.invite_token, h.contact_email, h.evening_invite,
        COALESCE((
          SELECT string_agg(m.full_name, ' & ' ORDER BY m.sort_order, m.created_at)
          FROM household_members m
          WHERE m.household_id = h.id
        ), h.contact_email) as display_name
      FROM households h
      WHERE h.id = ${householdId}
        AND h.is_paper_invite = false
        AND h.contact_email IS NOT NULL
      LIMIT 1
    `;
    const household = rows[0];
    if (!household) return NextResponse.redirect(new URL('/dashboard?resend=failed', request.url));

    try {
      const rsvpUrl = `${baseUrl}/rsvp?token=${household.invite_token}`;
      const sendResult = await resend.emails.send({
        from: 'Alannah & Rob <hello@alannah-rob.ie>',
        to: household.contact_email as string,
        subject: "You're invited — Alannah & Rob, 28 August 2026",
        html: buildInviteEmailHtml(
          household.display_name as string,
          rsvpUrl,
          baseUrl,
          household.evening_invite === true,
        ),
      });
      if (sendResult.error || !sendResult.data?.id) {
        throw new Error(sendResult.error?.message ?? 'Resend did not return a message id');
      }
      await sql`
        UPDATE households
        SET invited_at = COALESCE(invited_at, now()), invite_failed_count = 0, last_invite_failed_at = NULL, last_invite_error = NULL
        WHERE id = ${household.id}
      `;
      return NextResponse.redirect(new URL('/dashboard?resend=done', request.url));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown invite send failure';
      await sql`
        UPDATE households
        SET invite_failed_count = invite_failed_count + 1, last_invite_failed_at = now(), last_invite_error = ${message}
        WHERE id = ${household.id}
      `;
      return NextResponse.redirect(new URL('/dashboard?resend=failed', request.url));
    }
  }

  const password = formData.get('password');
  const nextPath = String(formData.get('next') ?? '/dashboard');
  if (typeof password !== 'string' || password !== adminSecret) {
    return NextResponse.redirect(new URL('/dashboard?error=invalid_password', request.url));
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionToken(adminSecret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
