import { sql } from '../../src/lib/db';
import { site } from '../../src/content/site';
import { DashboardTable } from './DashboardTable';
import { cookies } from 'next/headers';
import { verifyAdminSessionToken } from '../../src/lib/adminSession';
import { createCsrfToken } from '../../src/lib/csrf';
import { createGallerySignedUrl } from '../../src/lib/galleryStorage';
import { checkRateLimit } from '../../src/lib/rateLimit';
import { GALLERY_URL_RATE_LIMIT } from '../../src/lib/galleryConfig';
import { isGalleryAnnouncementEligible } from '../../src/lib/galleryAnnouncement';

export const dynamic = 'force-dynamic';
const MODERATION_PAGE_SIZE = 50;

type Member = {
  full_name: string;
  member_type: string;
  attending_day1: boolean | null;
  attending_day2: boolean | null;
  dietary: unknown;
};

type Row = {
  id: string;
  label: string | null;
  contact_email: string | null;
  address_line_one: string | null;
  evening_invite: boolean;
  invite_token: string;
  is_paper_invite: boolean;
  invited_at: string | null;
  invite_failed_count: number;
  last_invite_error: string | null;
  reminder_count: number;
  reminder_failed_count: number;
  gallery_announcement_sent_at: string | null;
  gallery_announcement_sending_at: string | null;
  gallery_announcement_failed_count: number;
  gallery_announcement_last_failed_at: string | null;
  gallery_announcement_last_error: string | null;
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  song: string | null;
  message: string | null;
  submitted_at: string | null;
  members: Member[];
  upload_portal_expires_at: string | null;
};

type ModerationRow = {
  public_key: string;
  storage_key: string;
  media_type: 'photo' | 'video';
  content_type: string;
  size_bytes: number | string;
  display_name: string;
  moderation_status: 'pending' | 'published' | 'rejected' | 'removed';
  household_display_name: string;
  created_at: string;
  published_at: string | null;
  rejected_at: string | null;
  removed_at: string | null;
  cleanup_error: string | null;
};

type ModerationAsset = Omit<ModerationRow, 'storage_key' | 'cleanup_error'> & {
  preview_url: string | null;
  cleanup_required: boolean;
};

type ModerationAction = 'publish_gallery_asset' | 'reject_gallery_asset' | 'remove_gallery_asset';

function formatModerationDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatAssetSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ModerationActionForm({
  action,
  assetKey,
  assetName,
  csrfToken,
  label,
}: {
  action: ModerationAction;
  assetKey: string;
  assetName: string;
  csrfToken: string;
  label: string;
}) {
  return (
    <form action="/api/dashboard" method="POST">
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="asset_key" value={assetKey} />
      <input type="hidden" name="csrf_token" value={csrfToken} />
      <button
        type="submit"
        className={action === 'remove_gallery_asset' || action === 'reject_gallery_asset'
          ? 'text-xs text-red-700 underline-offset-4 hover:underline'
          : 'text-xs text-mauve underline-offset-4 hover:text-charcoal hover:underline'}
        aria-label={`${label} ${assetName}`}
      >
        {label}
      </button>
    </form>
  );
}

function ModerationAssetCard({ asset, csrfToken }: { asset: ModerationAsset; csrfToken: string }) {
  const headingId = `moderation-asset-${asset.public_key}`;
  const accessibleName = `${asset.display_name} from ${asset.household_display_name}`;
  const stateLabel = asset.moderation_status[0].toUpperCase() + asset.moderation_status.slice(1);
  const stateDate = asset.moderation_status === 'published'
    ? asset.published_at
    : asset.moderation_status === 'rejected'
      ? asset.rejected_at
      : asset.removed_at;

  return (
    <article className="overflow-hidden rounded-2xl border border-stone bg-white/80" aria-labelledby={headingId}>
      <div className="flex min-h-48 items-center justify-center bg-charcoal/5 p-3">
        {asset.preview_url && asset.media_type === 'photo' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.preview_url} alt={accessibleName} className="max-h-72 w-full rounded-xl object-contain" loading="lazy" />
        ) : asset.preview_url ? (
          <video src={asset.preview_url} controls preload="metadata" className="max-h-72 w-full rounded-xl" aria-label={accessibleName}>
            Your browser cannot preview this video. Use the link below to open it.
          </video>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted" role="status">Preview temporarily unavailable.</p>
        )}
      </div>
      <div className="space-y-4 p-4">
        <div>
          <h3 id={headingId} className="break-words font-medium text-charcoal">{asset.display_name}</h3>
          <p className="mt-1 text-sm text-muted">{asset.household_display_name}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted">
          <div><dt className="uppercase tracking-[0.14em]">Type</dt><dd className="mt-0.5">{asset.media_type} · {asset.content_type}</dd></div>
          <div><dt className="uppercase tracking-[0.14em]">Size</dt><dd className="mt-0.5">{formatAssetSize(Number(asset.size_bytes))}</dd></div>
          <div><dt className="uppercase tracking-[0.14em]">Submitted</dt><dd className="mt-0.5">{formatModerationDate(asset.created_at)}</dd></div>
          <div><dt className="uppercase tracking-[0.14em]">Status</dt><dd className="mt-0.5">{stateLabel}</dd></div>
          <div><dt className="uppercase tracking-[0.14em]">Status changed</dt><dd className="mt-0.5">{formatModerationDate(stateDate)}</dd></div>
        </dl>
        {asset.preview_url ? (
          <a href={asset.preview_url} target="_blank" rel="noreferrer" className="text-xs text-mauve underline-offset-4 hover:text-charcoal hover:underline">
            Open media in a new tab
          </a>
        ) : null}
        <div className="flex flex-wrap gap-4 border-t border-stone/70 pt-3">
          {asset.moderation_status === 'pending' ? (
            <>
              <ModerationActionForm action="publish_gallery_asset" assetKey={asset.public_key} assetName={asset.display_name} csrfToken={csrfToken} label="Publish" />
              <ModerationActionForm action="reject_gallery_asset" assetKey={asset.public_key} assetName={asset.display_name} csrfToken={csrfToken} label="Reject" />
            </>
          ) : asset.cleanup_required ? (
            <ModerationActionForm
              action={asset.moderation_status === 'rejected' ? 'reject_gallery_asset' : 'remove_gallery_asset'}
              assetKey={asset.public_key}
              assetName={asset.display_name}
              csrfToken={csrfToken}
              label="Retry storage cleanup"
            />
          ) : asset.moderation_status === 'published' ? (
            <ModerationActionForm action="remove_gallery_asset" assetKey={asset.public_key} assetName={asset.display_name} csrfToken={csrfToken} label="Remove from event gallery" />
          ) : null}
        </div>
      </div>
    </article>
  );
}
type Props = {
  searchParams: Promise<{
    error?: string;
    upload?: string;
    upload_token?: string;
    moderation?: string;
    moderation_page?: string;
    announcement?: string;
    sent?: string;
    failed?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const {
    error,
    upload,
    upload_token: uploadToken,
    moderation,
    moderation_page: moderationPageParam,
    announcement,
    sent: announcementSentParam,
    failed: announcementFailedParam,
  } = await searchParams;
  const cookieStore = await cookies();
  const adminSession = cookieStore.get('admin_session')?.value;
  const adminSecret = process.env.ADMIN_SECRET;
  const isAuthorized = !!adminSecret && verifyAdminSessionToken(adminSession, adminSecret);
  const csrfToken = isAuthorized && adminSecret && adminSession ? createCsrfToken(adminSession, adminSecret) : '';

  if (!isAuthorized) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-5">
        <form action="/api/dashboard" method="POST" className="w-full rounded-2xl border border-stone bg-white/90 p-6 space-y-4">
          <div className="space-y-1 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Dashboard</p>
            <h1 className="font-heading text-2xl font-light text-charcoal">Admin access</h1>
          </div>
          <input type="hidden" name="next" value="/dashboard" />
          <label className="block space-y-1.5 text-sm">
            <span className="label-serif">Password</span>
            <input type="password" name="password" required className="w-full rounded-xl border border-stone bg-white px-3 py-2.5" />
          </label>
          {error === 'invalid_password' && <p className="text-xs text-red-700">Password incorrect. Try again.</p>}
          {error === 'missing_admin_secret' && (
            <p className="text-xs text-red-700">
              Dashboard is not configured. Add `ADMIN_SECRET` to this environment and redeploy.
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full">Open dashboard</button>
        </form>
      </div>
    );
  }

  const parsedModerationPage = Number.parseInt(moderationPageParam ?? '1', 10);
  const moderationPage = Number.isInteger(parsedModerationPage) && parsedModerationPage > 0
    ? Math.min(parsedModerationPage, 1000)
    : 1;
  const moderationOffset = (moderationPage - 1) * MODERATION_PAGE_SIZE;

  const rows = (await sql`
    SELECT
      h.id,
      h.label,
      h.contact_email,
      h.address_line_one,
      h.evening_invite,
      h.invite_token,
      h.is_paper_invite,
      h.invited_at,
      h.invite_failed_count,
      h.last_invite_error,
      h.reminder_count,
      h.reminder_failed_count,
      h.gallery_announcement_sent_at,
      h.gallery_announcement_sending_at,
      h.gallery_announcement_failed_count,
      h.gallery_announcement_last_failed_at,
      h.gallery_announcement_last_error,
      COALESCE(ho.open_count, 0) AS open_count,
      ho.first_opened_at,
      ho.last_opened_at,
      hr.song,
      hr.message,
      hr.submitted_at,
      (
        SELECT MAX(up.expires_at)
        FROM upload_portal_capabilities up
        WHERE up.household_id = h.id
          AND up.revoked_at IS NULL
          AND up.expires_at > now()
      ) AS upload_portal_expires_at,
      COALESCE(json_agg(json_build_object(
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
  `) as Row[];

  const moderationQueryRows = (await sql`
    SELECT
      ga.public_key,
      ga.storage_key,
      ga.media_type,
      ga.content_type,
      ga.size_bytes,
      ga.display_name,
      ga.moderation_status,
      ga.created_at,
      ga.published_at,
      ga.rejected_at,
      ga.removed_at,
      ga.cleanup_error,
      COALESCE(
        NULLIF(h.label, ''),
        NULLIF(string_agg(hm.full_name, ' & ' ORDER BY hm.sort_order, hm.created_at), ''),
        NULLIF(h.contact_email, ''),
        'Unknown household'
      ) AS household_display_name
    FROM gallery_assets ga
    LEFT JOIN households h ON h.id = ga.household_id
    LEFT JOIN household_members hm ON hm.household_id = ga.household_id
    WHERE ga.moderation_status IN ('pending', 'published')
      OR ga.cleanup_error IS NOT NULL
    GROUP BY
      ga.public_key,
      ga.storage_key,
      ga.media_type,
      ga.content_type,
      ga.size_bytes,
      ga.display_name,
      ga.moderation_status,
      ga.created_at,
      ga.published_at,
      ga.rejected_at,
      ga.removed_at,
      ga.cleanup_error,
      h.label,
      h.contact_email
    ORDER BY CASE
      WHEN ga.moderation_status = 'pending' THEN 0
      WHEN ga.moderation_status = 'published' THEN 1
      ELSE 2
    END, ga.created_at DESC
    LIMIT ${MODERATION_PAGE_SIZE + 1} OFFSET ${moderationOffset}
  `) as ModerationRow[];

  const hasMoreModeration = moderationQueryRows.length > MODERATION_PAGE_SIZE;
  const moderationRows = moderationQueryRows.slice(0, MODERATION_PAGE_SIZE);

  const moderationAssets = await Promise.all(moderationRows.map(async (row): Promise<ModerationAsset> => {
    let previewUrl: string | null = null;
    try {
      if (await checkRateLimit('gallery:moderation-preview', GALLERY_URL_RATE_LIMIT)) {
        previewUrl = (await createGallerySignedUrl(row.storage_key)).url;
      }
    } catch {
      // Metadata and moderation actions remain available when preview signing is temporarily unavailable.
    }

    return {
      public_key: String(row.public_key),
      media_type: row.media_type,
      content_type: String(row.content_type),
      size_bytes: Number(row.size_bytes),
      display_name: String(row.display_name),
      moderation_status: row.moderation_status,
      household_display_name: String(row.household_display_name),
      created_at: String(row.created_at),
      published_at: row.published_at ? String(row.published_at) : null,
      rejected_at: row.rejected_at ? String(row.rejected_at) : null,
      removed_at: row.removed_at ? String(row.removed_at) : null,
      cleanup_required: Boolean(row.cleanup_error),
      preview_url: previewUrl,
    };
  }));
  const pendingAssets = moderationAssets.filter((asset) => asset.moderation_status === 'pending');
  const cleanupAssets = moderationAssets.filter((asset) => asset.cleanup_required);
  const publishedAssets = moderationAssets.filter((asset) => asset.moderation_status === 'published');

  const totalGuests = rows.reduce((sum, r) => sum + r.members.length, 0);
  const invitedGuests = rows.reduce((sum, r) => sum + (r.invited_at || r.is_paper_invite ? r.members.length : 0), 0);
  const comingGuests = rows.reduce(
    (sum, r) => sum + (r.submitted_at ? r.members.filter((m) => !!(m.attending_day1 || m.attending_day2)).length : 0),
    0
  );
  const notComingGuests = rows.reduce(
    (sum, r) => sum + (r.submitted_at ? r.members.filter((m) => m.attending_day1 === false && m.attending_day2 === false).length : 0),
    0
  );
  const noResponseGuests = rows.reduce(
    (sum, r) => sum + ((r.invited_at || r.is_paper_invite) && !r.submitted_at ? r.members.length : 0),
    0
  );
  const galleryEligibleHouseholds = rows.filter(isGalleryAnnouncementEligible);
  const galleryAnnouncementSentCount = galleryEligibleHouseholds.filter((row) => row.gallery_announcement_sent_at).length;
  const galleryAnnouncementFailedCount = galleryEligibleHouseholds.filter(
    (row) => !row.gallery_announcement_sent_at && row.gallery_announcement_failed_count > 0,
  ).length;
  const parsedAnnouncementSent = Number.parseInt(announcementSentParam ?? '', 10);
  const parsedAnnouncementFailed = Number.parseInt(announcementFailedParam ?? '', 10);
  const announcementSentCount = Number.isInteger(parsedAnnouncementSent) && parsedAnnouncementSent >= 0
    ? Math.min(parsedAnnouncementSent, rows.length)
    : 0;
  const announcementFailedCount = Number.isInteger(parsedAnnouncementFailed) && parsedAnnouncementFailed >= 0
    ? Math.min(parsedAnnouncementFailed, rows.length)
    : 0;


  const uploadPortalLink = uploadToken
    ? `${(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://alannah-rob.ie').replace(/\/$/, '')}/upload?token=${encodeURIComponent(uploadToken)}`
    : null;

  return (
    <div className="mx-auto max-w-6xl px-5 pt-[72px] pb-20 space-y-10">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Dashboard</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">{site.coupleNames}</h1>
        <div className="flex items-center justify-center gap-4 pt-1">
          <form action="/api/dashboard" method="POST">
            <input type="hidden" name="action" value="logout" />
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <button type="submit" className="text-xs text-muted underline-offset-4 hover:underline hover:text-charcoal transition-colors">Log out</button>
          </form>
        </div>
      </header>
      {error === 'invite_sending_disabled' && (
        <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-muted">
          Invitation and reminder email sending is disabled.
        </p>
      )}

      {announcement === 'done' && (
        <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-charcoal" role="status">
          Gallery announcement batch complete: {announcementSentCount} sent, {announcementFailedCount} failed. Failed households remain retryable.
        </p>
      )}
      {announcement === 'failed' && (
        <p className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-center text-sm text-red-700" role="alert">
          Gallery announcement batch could not be started. No messages were sent.
        </p>
      )}
      {announcement === 'unauthorized' && (
        <p className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-center text-sm text-red-700" role="alert">
          Gallery announcement action was not authorized.
        </p>
      )}

      <section className="space-y-4 rounded-2xl border border-stone bg-white/60 p-5 sm:p-6" aria-labelledby="gallery-announcement-heading">
        <header>
          <h2 id="gallery-announcement-heading" className="font-heading text-3xl font-light text-charcoal">Gallery announcement</h2>
          <p className="mt-1 text-sm text-muted">
            Send the post-wedding message manually to {galleryEligibleHouseholds.length} eligible household{galleryEligibleHouseholds.length === 1 ? '' : 's'}.
            Successful sends are skipped on later runs; failed sends remain retryable.
          </p>
        </header>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <a href="/gallery-announcement-preview" className="text-mauve underline-offset-4 hover:text-charcoal hover:underline">Preview announcement</a>
          <form action="/api/dashboard" method="POST">
            <input type="hidden" name="action" value="send_gallery_announcements" />
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <button type="submit" disabled={galleryEligibleHouseholds.length === 0} className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50">
              Send Gallery announcements
            </button>
          </form>
        </div>
        <p className="text-xs text-muted">
          Durable status: {galleryAnnouncementSentCount} sent, {galleryAnnouncementFailedCount} failed and retryable.
        </p>
      </section>

      {upload === 'done' && uploadPortalLink && (
        <div className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-charcoal">
          <p>Upload portal link ready.</p>
          <a href={uploadPortalLink} className="mt-1 inline-block break-all text-mauve hover:text-charcoal">{uploadPortalLink}</a>
        </div>
      )}
      {upload === 'failed' && <p className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-center text-sm text-red-700">Upload portal link could not be changed.</p>}
      {upload === 'revoked' && <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-charcoal">Upload portal link revoked.</p>}
      {upload === 'sent' && <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-charcoal">Upload portal link sent to the household contact.</p>}

      {moderation === 'published' && (
        <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-charcoal" role="status">
          Submission published and now visible through the event gallery.
        </p>
      )}
      {moderation === 'already_published' && (
        <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-charcoal" role="status">
          That submission was already published.
        </p>
      )}
      {moderation === 'rejected' || moderation === 'already_rejected' ? (
        <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-charcoal" role="status">
          Pending submission rejected and kept out of the event gallery.
        </p>
      ) : null}
      {moderation === 'removed' || moderation === 'already_removed' ? (
        <p className="rounded-xl border border-stone bg-white/80 px-4 py-3 text-center text-sm text-charcoal" role="status">
          Published asset removed from the event gallery.
        </p>
      ) : null}
      {moderation === 'cleanup_failed' && (
        <p className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-center text-sm text-red-700" role="alert">
          Moderation changed, but private storage cleanup needs another attempt.
        </p>
      )}
      {(moderation === 'unauthorized' || moderation === 'invalid_asset' || moderation === 'invalid_transition' || moderation === 'missing' || moderation === 'failed') && (
        <p className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-center text-sm text-red-700" role="alert">
          Moderation action could not be completed.
        </p>
      )}

      <section className="space-y-5 rounded-2xl border border-stone bg-white/60 p-5 sm:p-6" aria-labelledby="pending-submissions-heading">
        <header>
          <h2 id="pending-submissions-heading" className="font-heading text-3xl font-light text-charcoal">Pending submissions</h2>
          <p className="mt-1 text-sm text-muted">Review each guest submission. Pending submissions are not visible through the event gallery.</p>
        </header>
        {pendingAssets.length > 0 ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {pendingAssets.map((asset) => <ModerationAssetCard key={asset.public_key} asset={asset} csrfToken={csrfToken} />)}
          </div>
        ) : (
          <p className="rounded-xl border border-stone/80 bg-ivory/70 px-4 py-8 text-center text-sm text-muted" role="status">
            No submissions are waiting for review.
          </p>
        )}
      </section>

      <section className="space-y-5 rounded-2xl border border-stone bg-white/60 p-5 sm:p-6" aria-labelledby="published-assets-heading">
        <header>
          <h2 id="published-assets-heading" className="font-heading text-3xl font-light text-charcoal">Published assets</h2>
          <p className="mt-1 text-sm text-muted">Remove a published asset to withdraw it from event gallery viewer responses.</p>
        </header>
        {publishedAssets.length > 0 ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {publishedAssets.map((asset) => <ModerationAssetCard key={asset.public_key} asset={asset} csrfToken={csrfToken} />)}
          </div>
        ) : (
          <p className="rounded-xl border border-stone/80 bg-ivory/70 px-4 py-8 text-center text-sm text-muted" role="status">
            No assets have been published yet.
          </p>
        )}
      </section>

      {cleanupAssets.length > 0 ? (
        <section className="space-y-5 rounded-2xl border border-red-200 bg-red-50/30 p-5 sm:p-6" aria-labelledby="cleanup-required-heading">
          <header>
            <h2 id="cleanup-required-heading" className="font-heading text-3xl font-light text-charcoal">Storage cleanup required</h2>
            <p className="mt-1 text-sm text-muted">These assets stay hidden from the event gallery until their private storage object is removed.</p>
          </header>
          <div className="grid gap-5 lg:grid-cols-2">
            {cleanupAssets.map((asset) => <ModerationAssetCard key={asset.public_key} asset={asset} csrfToken={csrfToken} />)}
          </div>
        </section>
      ) : null}

      {(moderationPage > 1 || hasMoreModeration) ? (
        <nav className="flex items-center justify-between rounded-xl border border-stone bg-white/70 px-4 py-3 text-sm" aria-label="Moderation pages">
          {moderationPage > 1 ? (
            <a href={`/dashboard?moderation_page=${moderationPage - 1}`} className="text-mauve underline-offset-4 hover:text-charcoal hover:underline">
              Previous
            </a>
          ) : <span />}
          <span className="text-muted">Moderation page {moderationPage}</span>
          {hasMoreModeration ? (
            <a href={`/dashboard?moderation_page=${moderationPage + 1}`} className="text-mauve underline-offset-4 hover:text-charcoal hover:underline">
              Next
            </a>
          ) : <span />}
        </nav>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Total guests', value: totalGuests },
          { label: 'Invited guests', value: invitedGuests },
          { label: 'Coming guests', value: comingGuests },
          { label: 'Not coming', value: notComingGuests },
          { label: 'No response', value: noResponseGuests },
        ].map((stat) => (
          <div key={stat.label} className="card p-4 text-center">
            <p className="font-heading text-3xl font-light text-charcoal">{stat.value}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      <DashboardTable rows={rows} csrfToken={csrfToken} />
    </div>
  );
}
