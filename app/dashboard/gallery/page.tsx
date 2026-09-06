import Link from 'next/link';
import { cookies } from 'next/headers';
import { unstable_noStore as noStore } from 'next/cache';
import { sql } from '../../../src/lib/db';
import { createCsrfToken } from '../../../src/lib/csrf';
import { getGalleryConfig } from '../../../src/lib/galleryConfig';
import { verifyAdminSessionToken } from '../../../src/lib/adminSession';
import { CopyButton } from '../../../src/components/CopyButton';
import { AdminLoginForm } from '../AdminLoginForm';
import { GalleryAdminClient, type GalleryAdminHousehold } from './GalleryAdminClient';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ error?: string }>;
};

type GalleryHouseholdRow = {
  id: string;
  display_name: string;
  contact_email: string | null;
  delivery_status: GalleryAdminHousehold['deliveryStatus'];
  delivery_error: string | null;
};

type StorageRow = {
  used_bytes: number | string;
  reserved_bytes: number | string;
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function configurationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Gallery configuration is incomplete';
}

export default async function GalleryAdminPage({ searchParams }: Props) {
  noStore();
  const { error } = await searchParams;
  const cookieStore = await cookies();
  const adminSession = cookieStore.get('admin_session')?.value;
  const adminSecret = process.env.ADMIN_SECRET;
  const isAuthorized = !!adminSecret && verifyAdminSessionToken(adminSession, adminSecret);

  if (!isAuthorized) return <AdminLoginForm error={error} nextPath="/dashboard/gallery" />;

  let config;
  let galleryUrl = '';
  let storage: StorageRow | null = null;
  let households: GalleryAdminHousehold[] = [];
  let blockingError: string | null = null;

  try {
    config = getGalleryConfig();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl || !process.env.RESEND_API_KEY) throw new Error('NEXT_PUBLIC_BASE_URL and RESEND_API_KEY are required for gallery email delivery');

    const accessUrl = new URL('/gallery/access', baseUrl);
    accessUrl.searchParams.set('token', config.accessToken);
    galleryUrl = accessUrl.toString();

    const storageRows = await sql`
      SELECT used_bytes, reserved_bytes
      FROM gallery_storage_state
      WHERE id = 1
    `;
    storage = (storageRows[0] as StorageRow | undefined) ?? null;
    if (!storage) throw new Error('Gallery storage state is missing; run the database migration');

    const rows = (await sql`
      SELECT
        h.id,
        COALESCE(NULLIF(BTRIM(h.label), ''), member_names.display_name, h.contact_email) AS display_name,
        h.contact_email,
        delivery.status AS delivery_status,
        delivery.error AS delivery_error
      FROM households h
      JOIN household_rsvps hr ON hr.household_id = h.id
      LEFT JOIN LATERAL (
        SELECT string_agg(m.full_name, ' & ' ORDER BY m.sort_order, m.created_at) AS display_name
        FROM household_members m
        WHERE m.household_id = h.id
      ) member_names ON true
      LEFT JOIN LATERAL (
        SELECT d.status, d.error
        FROM gallery_email_deliveries d
        WHERE d.household_id = h.id
        ORDER BY d.started_at DESC, d.request_id DESC
        LIMIT 1
      ) delivery ON true
      WHERE EXISTS (
        SELECT 1
        FROM household_members attending
        WHERE attending.household_id = h.id
          AND (attending.attending_day1 = true OR attending.attending_day2 = true)
      )
      ORDER BY LOWER(COALESCE(NULLIF(BTRIM(h.label), ''), member_names.display_name, h.contact_email))
    `) as GalleryHouseholdRow[];

    households = rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: row.contact_email,
      deliveryStatus: row.delivery_status ?? null,
      deliveryError: row.delivery_error,
    }));
  } catch (caught) {
    blockingError = configurationErrorMessage(caught);
  }

  const csrfToken = adminSecret && adminSession ? createCsrfToken(adminSession, adminSecret) : '';
  const usedBytes = storage ? Number(storage.used_bytes) : 0;
  const reservedBytes = storage ? Number(storage.reserved_bytes) : 0;
  const totalBytes = usedBytes + reservedBytes;
  const warningBytes = config?.storageWarningBytes ?? 0;
  const limitBytes = config?.storageLimitBytes ?? 0;
  const storageClass = totalBytes >= limitBytes ? 'text-red-700' : totalBytes >= warningBytes ? 'text-amber-700' : 'text-charcoal';

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-5 pb-20 pt-[72px]">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Gallery admin</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">Wedding photo gallery</h1>
        <nav className="flex flex-wrap items-center justify-center gap-4 text-xs" aria-label="Admin sections">
          <Link href="/dashboard" className="text-mauve underline-offset-4 hover:text-charcoal hover:underline">RSVP dashboard</Link>
          <form action="/api/dashboard" method="POST">
            <input type="hidden" name="action" value="logout" />
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <button type="submit" className="text-muted underline-offset-4 hover:text-charcoal hover:underline">Log out</button>
          </form>
        </nav>
      </header>

      {blockingError ? (
        <section className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center text-sm text-red-700" role="alert">
          Gallery admin is unavailable: {blockingError}
        </section>
      ) : (
        <>
          <section className="card space-y-4 p-6">
            <div>
              <h2 className="font-heading text-2xl text-charcoal">Shared guest link</h2>
              <p className="mt-1 text-sm text-muted">Anyone with this link can view and add gallery photos. It is intentionally shareable.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <code className="max-w-full break-all rounded-lg border border-stone bg-white/70 px-3 py-2 text-xs text-charcoal">{galleryUrl}</code>
              <CopyButton text={galleryUrl} label="Copy gallery link" />
            </div>
          </section>

          <section className="card space-y-2 p-6">
            <h2 className="font-heading text-2xl text-charcoal">Storage</h2>
            <p className={`text-lg font-medium ${storageClass}`}>{formatBytes(totalBytes)} used or reserved</p>
            <p className="text-sm text-muted">
              {formatBytes(usedBytes)} processed and {formatBytes(reservedBytes)} reserved · warning at {formatBytes(warningBytes)} · hard limit {formatBytes(limitBytes)}
            </p>
          </section>

          <section className="card space-y-4 p-6">
            <div>
              <h2 className="font-heading text-2xl text-charcoal">Email gallery access</h2>
              <p className="mt-1 text-sm text-muted">Only households with a submitted RSVP and at least one attending member appear here.</p>
            </div>
            <GalleryAdminClient households={households} galleryUrl={galleryUrl} csrfToken={csrfToken} />
          </section>
        </>
      )}
    </div>
  );
}
