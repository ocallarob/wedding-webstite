import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { Resend } from 'resend';
import { sql } from '../../../src/lib/db';
import { checkRateLimit } from '../../../src/lib/rateLimit';
import { UPLOAD_PORTAL_RESEND_RATE_LIMIT, GALLERY_ANNOUNCEMENT_INTERVAL_MS, GALLERY_ANNOUNCEMENT_CLAIM_TTL_SECONDS } from '../../../src/lib/galleryConfig';
import { ADMIN_COOKIE_NAME, hasAdminAuth, isSameOriginRequest } from '../../../src/lib/adminAuth';
import { createAdminSessionToken, SESSION_TTL_SECONDS } from '../../../src/lib/adminSession';
import { verifyCsrfToken } from '../../../src/lib/csrf';
import { buildUploadPortalEmailHtml } from '../../../src/lib/uploadPortalEmailHtml';
import { buildGalleryAnnouncementEmailHtml, buildGalleryAnnouncementSubject } from '../../../src/lib/galleryAnnouncementEmailHtml';
import { createGalleryCapability } from '../../../src/lib/galleryCapabilities';
import type { IssuedGalleryCapability } from '../../../src/lib/galleryCapabilities';
import { isGalleryAnnouncementEligible, galleryAnnouncementDisplayName } from '../../../src/lib/galleryAnnouncement';
import { runThrottledBatch } from '../../../src/lib/throttledBatch';
import {
  createUploadPortalCapability,
  revokeOtherUploadPortalCapabilities,
  revokeUploadPortalCapability,
  revokeUploadPortalCapabilities,
} from '../../../src/lib/uploadPortalCapabilities';
import type { IssuedUploadPortalCapability } from '../../../src/lib/uploadPortalCapabilities';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type ModerationAction = 'publish_gallery_asset' | 'reject_gallery_asset' | 'remove_gallery_asset';
type ModerationResult =
  | 'published'
  | 'already_published'
  | 'rejected'
  | 'already_rejected'
  | 'removed'
  | 'already_removed'
  | 'cleanup_failed'
  | 'missing'
  | 'invalid_transition';

type GalleryAnnouncementRow = {
  id: string;
  label: string | null;
  contact_email: string | null;
  gallery_announcement_sent_at: string | null;
  gallery_announcement_sending_at: string | null;
  members: unknown;
};

type GalleryAnnouncementBatchResult = {
  sent: number;
  failed: number;
};

function moderationRedirect(request: NextRequest, result: ModerationResult | 'unauthorized' | 'invalid_asset' | 'failed') {
  return NextResponse.redirect(new URL(`/dashboard?moderation=${result}`, request.url), 303);
}

function galleryAnnouncementRedirect(
  request: NextRequest,
  result: 'done' | 'failed' | 'unauthorized',
  counts?: GalleryAnnouncementBatchResult,
) {
  const url = new URL('/dashboard', request.url);
  url.searchParams.set('announcement', result);
  if (counts) {
    url.searchParams.set('sent', String(counts.sent));
    url.searchParams.set('failed', String(counts.failed));
  }
  return NextResponse.redirect(url, 303);
}

function galleryAnnouncementErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 500);
  return 'Gallery announcement delivery failed';
}

async function recordGalleryAnnouncementFailure(
  householdId: string,
  error: unknown,
  releaseClaim: boolean,
): Promise<void> {
  await sql`
    UPDATE households
    SET gallery_announcement_failed_count = gallery_announcement_failed_count + 1,
        gallery_announcement_last_failed_at = now(),
        gallery_announcement_last_error = ${galleryAnnouncementErrorMessage(error)},
        gallery_announcement_sending_at = CASE
          WHEN ${releaseClaim} THEN NULL
          ELSE gallery_announcement_sending_at
        END
    WHERE id = ${householdId}
      AND gallery_announcement_sent_at IS NULL
  `;
}

async function sendGalleryAnnouncements(): Promise<GalleryAnnouncementBatchResult> {
  const rows = (await sql`
    WITH claimed AS (
      UPDATE households h
      SET gallery_announcement_sending_at = now()
      WHERE h.gallery_announcement_sent_at IS NULL
        AND (
          h.gallery_announcement_sending_at IS NULL
          OR h.gallery_announcement_sending_at < now() - (${GALLERY_ANNOUNCEMENT_CLAIM_TTL_SECONDS} * INTERVAL '1 second')
        )
        AND NULLIF(BTRIM(h.contact_email), '') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM household_members eligible_member
          WHERE eligible_member.household_id = h.id
            AND (eligible_member.attending_day1 IS TRUE OR eligible_member.attending_day2 IS TRUE)
        )
      RETURNING h.id, h.label, h.contact_email, h.gallery_announcement_sent_at, h.gallery_announcement_sending_at
    )
    SELECT
      c.id,
      c.label,
      c.contact_email,
      c.gallery_announcement_sent_at,
      c.gallery_announcement_sending_at,
      COALESCE(json_agg(json_build_object(
        'full_name', m.full_name,
        'attending_day1', m.attending_day1,
        'attending_day2', m.attending_day2
      ) ORDER BY m.sort_order, m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]'::json) AS members
    FROM claimed c
    LEFT JOIN household_members m ON m.household_id = c.id
    GROUP BY c.id
    ORDER BY COALESCE(c.label, c.contact_email)
  `) as GalleryAnnouncementRow[];

  const recipients = rows.filter((row) => !row.gallery_announcement_sent_at && isGalleryAnnouncementEligible(row));
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  let galleryCapability: IssuedGalleryCapability;
  try {
    galleryCapability = await createGalleryCapability();
  } catch (error) {
    for (const recipient of recipients) {
      await recordGalleryAnnouncementFailure(String(recipient.id), error, true);
    }
    throw error;
  }

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie').replace(/\/$/, '');
  const galleryUrl = `${baseUrl}/gallery?token=${encodeURIComponent(galleryCapability.token)}`;
  const resend = new Resend(process.env.RESEND_API_KEY);

  return runThrottledBatch({
    items: recipients,
    intervalMs: GALLERY_ANNOUNCEMENT_INTERVAL_MS,
    runItem: async (recipient) => {
      const householdId = String(recipient.id);
      let uploadCapability: IssuedUploadPortalCapability | undefined;
      let providerAccepted = false;

      try {
        uploadCapability = await createUploadPortalCapability(householdId, false);
        const uploadUrl = `${baseUrl}/upload?token=${encodeURIComponent(uploadCapability.token)}`;
        const sendResult = await resend.emails.send(
          {
            from: 'Alannah & Rob <hello@alannah-rob.ie>',
            to: String(recipient.contact_email).trim(),
            subject: buildGalleryAnnouncementSubject(),
            html: buildGalleryAnnouncementEmailHtml(galleryAnnouncementDisplayName(recipient), galleryUrl, uploadUrl),
          },
          { idempotencyKey: `gallery-announcement:${householdId}` },
        );
        if (sendResult.error || !sendResult.data?.id) {
          throw new Error(sendResult.error?.message ?? 'Resend did not return a message id');
        }
        providerAccepted = true;

        const recorded = await sql`
          UPDATE households
          SET gallery_announcement_sent_at = now(),
              gallery_announcement_sending_at = NULL,
              gallery_announcement_last_error = NULL
          WHERE id = ${householdId}
            AND gallery_announcement_sent_at IS NULL
          RETURNING id
        `;
        if (recorded.length === 0) {
          throw new Error('Gallery announcement result could not be recorded');
        }
      } catch (error) {
        await recordGalleryAnnouncementFailure(householdId, error, !providerAccepted);
        throw error;
      }
    },
  });
}


function isModerationAssetKey(value: FormDataEntryValue | null): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,256}$/.test(value);
}

async function cleanupGalleryAsset(assetId: string, storageKey: string): Promise<boolean> {
  try {
    await del(storageKey);
    await sql`UPDATE gallery_assets SET cleanup_error = NULL WHERE id = ${assetId}`;
    return true;
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message.slice(0, 500) : 'Blob cleanup failed';
    try {
      await sql`UPDATE gallery_assets SET cleanup_error = ${message} WHERE id = ${assetId}`;
    } catch {
      // Moderation state remains authoritative if cleanup bookkeeping also fails.
    }
    return false;
  }
}

async function moderateGalleryAsset(action: ModerationAction, assetKey: string): Promise<ModerationResult> {
  const rows = await sql`
    SELECT id, storage_key, moderation_status, cleanup_error
    FROM gallery_assets
    WHERE public_key = ${assetKey}
    LIMIT 1
  `;
  const asset = rows[0];
  if (!asset) return 'missing';

  const id = String(asset.id);
  const status = String(asset.moderation_status);
  const storageKey = String(asset.storage_key);

  if (action === 'publish_gallery_asset') {
    if (status === 'published') return 'already_published';
    if (status !== 'pending') return 'invalid_transition';

    const updated = await sql`
      UPDATE gallery_assets
      SET moderation_status = 'published',
          published_at = COALESCE(published_at, now()),
          rejected_at = NULL,
          removed_at = NULL,
          cleanup_error = NULL
      WHERE id = ${id} AND moderation_status = 'pending'
      RETURNING id
    `;
    if (updated.length > 0) return 'published';

    const current = await sql`
      SELECT moderation_status
      FROM gallery_assets
      WHERE id = ${id}
      LIMIT 1
    `;
    return current[0]?.moderation_status === 'published' ? 'already_published' : 'invalid_transition';
  }

  if (action === 'reject_gallery_asset') {
    if (status === 'rejected') {
      if (asset.cleanup_error) return (await cleanupGalleryAsset(id, storageKey)) ? 'already_rejected' : 'cleanup_failed';
      return 'already_rejected';
    }
    if (status !== 'pending') return 'invalid_transition';

    const updated = await sql`
      UPDATE gallery_assets
      SET moderation_status = 'rejected',
          rejected_at = COALESCE(rejected_at, now()),
          cleanup_error = 'cleanup_pending'
      WHERE id = ${id} AND moderation_status = 'pending'
      RETURNING id
    `;
    if (updated.length === 0) {
      const current = await sql`
        SELECT moderation_status
        FROM gallery_assets
        WHERE id = ${id}
        LIMIT 1
      `;
      return current[0]?.moderation_status === 'rejected' ? 'already_rejected' : 'invalid_transition';
    }

    return (await cleanupGalleryAsset(id, storageKey)) ? 'rejected' : 'cleanup_failed';
  }

  if (status === 'removed') {
    if (asset.cleanup_error) return (await cleanupGalleryAsset(id, storageKey)) ? 'already_removed' : 'cleanup_failed';
    return 'already_removed';
  }
  if (status !== 'published') return 'invalid_transition';

  const updated = await sql`
    UPDATE gallery_assets
    SET moderation_status = 'removed',
        removed_at = COALESCE(removed_at, now()),
        cleanup_error = 'cleanup_pending'
    WHERE id = ${id} AND moderation_status = 'published'
    RETURNING id
  `;
  if (updated.length === 0) {
    const current = await sql`
      SELECT moderation_status
      FROM gallery_assets
      WHERE id = ${id}
      LIMIT 1
    `;
    return current[0]?.moderation_status === 'removed' ? 'already_removed' : 'invalid_transition';
  }

  return (await cleanupGalleryAsset(id, storageKey)) ? 'removed' : 'cleanup_failed';
}

export async function GET(request: NextRequest) {
  if (!hasAdminAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const households = await sql`
    SELECT
      h.id, h.label, h.contact_email, h.address_line_one, h.evening_invite, h.is_paper_invite, h.invited_at,
      h.invite_failed_count, h.reminder_count, h.reminder_failed_count,
      h.gallery_announcement_sent_at, h.gallery_announcement_sending_at,
      h.gallery_announcement_failed_count,
      h.gallery_announcement_last_failed_at, h.gallery_announcement_last_error,
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
  if (action === 'send_reminders' || action === 'resend_invite') {
    return NextResponse.redirect(new URL('/dashboard?error=invite_sending_disabled', request.url));
  }

  if (!adminSecret) {
    return NextResponse.redirect(new URL('/dashboard?error=missing_admin_secret', request.url));
  }

  if (action === 'send_gallery_announcements') {
    if (!hasAdminAuth(request)) return galleryAnnouncementRedirect(request, 'unauthorized');
    if (!isSameOriginRequest(request)) return galleryAnnouncementRedirect(request, 'unauthorized');
    if (!csrfValid) return galleryAnnouncementRedirect(request, 'unauthorized');

    try {
      const result = await sendGalleryAnnouncements();
      return galleryAnnouncementRedirect(request, 'done', result);
    } catch {
      return galleryAnnouncementRedirect(request, 'failed');
    }
  }

  if (action === 'publish_gallery_asset' || action === 'reject_gallery_asset' || action === 'remove_gallery_asset') {
    if (!hasAdminAuth(request)) return moderationRedirect(request, 'unauthorized');
    if (!isSameOriginRequest(request)) return moderationRedirect(request, 'unauthorized');
    if (!csrfValid) return moderationRedirect(request, 'unauthorized');

    const assetKey = formData.get('asset_key');
    if (!isModerationAssetKey(assetKey)) return moderationRedirect(request, 'invalid_asset');

    try {
      const result = await moderateGalleryAsset(action, assetKey);
      return moderationRedirect(request, result);
    } catch {
      return moderationRedirect(request, 'failed');
    }
  }

  if (action === 'generate_upload_portal' || action === 'resend_upload_portal' || action === 'revoke_upload_portal') {
    if (!hasAdminAuth(request)) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));
    if (!isSameOriginRequest(request)) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));
    if (!csrfValid) return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url));

    const householdId = String(formData.get('household_id') ?? '').trim();
    if (!householdId) return NextResponse.redirect(new URL('/dashboard?upload=failed', request.url));

    try {
      if (action === 'resend_upload_portal') {
        const allowed = await checkRateLimit(
          `upload-portal:resend:household:${householdId}`,
          UPLOAD_PORTAL_RESEND_RATE_LIMIT,
        );
        if (!allowed) return NextResponse.redirect(new URL('/dashboard?upload=failed', request.url));
      }
      if (action === 'revoke_upload_portal') {
        await revokeUploadPortalCapabilities(householdId);
        return NextResponse.redirect(new URL('/dashboard?upload=revoked', request.url));
      }

      if (action === 'resend_upload_portal') {
        const rows = await sql`
          SELECT contact_email
          FROM households
          WHERE id = ${householdId}
            AND NULLIF(BTRIM(contact_email), '') IS NOT NULL
          LIMIT 1
        `;
        const household = rows[0];
        if (!household) return NextResponse.redirect(new URL('/dashboard?upload=failed', request.url));

        let capability: IssuedUploadPortalCapability | undefined;
        try {
          capability = await createUploadPortalCapability(householdId, false);
          const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie').replace(/\/$/, '');
          const uploadUrl = `${baseUrl}/upload?token=${encodeURIComponent(capability.token)}`;
          const resend = new Resend(process.env.RESEND_API_KEY);
          const sendResult = await resend.emails.send({
            from: 'Alannah & Rob <hello@alannah-rob.ie>',
            to: String(household.contact_email).trim(),
            subject: 'Your Alannah & Rob Upload portal',
            html: buildUploadPortalEmailHtml(uploadUrl),
          });
          if (sendResult.error || !sendResult.data?.id) {
            throw new Error(sendResult.error?.message ?? 'Resend did not return a message id');
          }
        } catch {
          if (capability) {
            try {
              await revokeUploadPortalCapability(householdId, capability.token);
            } catch {
              // Keep the existing capability usable if cleanup is temporarily unavailable.
            }
          }
          return NextResponse.redirect(new URL('/dashboard?upload=failed', request.url));
        }

        try {
          await revokeOtherUploadPortalCapabilities(householdId, capability.token);
        } catch {
          // A delivered capability remains usable if stale-token cleanup is temporarily unavailable.
        }
        return NextResponse.redirect(new URL('/dashboard?upload=sent', request.url));
      }

      const capability = await createUploadPortalCapability(householdId);
      return NextResponse.redirect(
        new URL(`/dashboard?upload=done&upload_token=${encodeURIComponent(capability.token)}`, request.url),
      );
    } catch {
      return NextResponse.redirect(new URL('/dashboard?upload=failed', request.url));
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
