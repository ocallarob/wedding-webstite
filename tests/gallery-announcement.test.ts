import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAdminSessionToken } from '../src/lib/adminSession';
import { createCsrfToken } from '../src/lib/csrf';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  sendEmail: vi.fn(),
  createGalleryCapability: vi.fn(),
  createUploadPortalCapability: vi.fn(),
  revokeOtherUploadPortalCapabilities: vi.fn(),
  revokeUploadPortalCapability: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({ sql: mocks.sql }));
vi.mock('../src/lib/galleryCapabilities', () => ({ createGalleryCapability: mocks.createGalleryCapability }));
vi.mock('../src/lib/uploadPortalCapabilities', () => ({
  createUploadPortalCapability: mocks.createUploadPortalCapability,
  revokeOtherUploadPortalCapabilities: mocks.revokeOtherUploadPortalCapabilities,
  revokeUploadPortalCapability: mocks.revokeUploadPortalCapability,
  revokeUploadPortalCapabilities: vi.fn(),
}));
vi.mock('../src/lib/throttledBatch', () => ({
  runThrottledBatch: async ({ items, runItem }: { items: unknown[]; runItem: (item: unknown) => Promise<void> }) => {
    let sent = 0;
    let failed = 0;
    for (const item of items) {
      try {
        await runItem(item);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    return { sent, failed };
  },
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.sendEmail };
  },
}));

import { POST as postDashboard } from '../app/api/dashboard/route';

const adminSecret = 'announcement-secret';
const expiresAt = new Date('2026-12-01T00:00:00.000Z');

function dashboardRequest(
  action: string,
  options: { authenticated?: boolean; origin?: string; csrf?: string } = {},
): NextRequest {
  const formData = new FormData();
  formData.set('action', action);
  const headers = new Headers({ origin: options.origin ?? 'http://localhost' });

  if (options.authenticated !== false) {
    const session = createAdminSessionToken(adminSecret);
    headers.set('cookie', `admin_session=${session}`);
    formData.set('csrf_token', options.csrf ?? createCsrfToken(session, adminSecret));
  } else {
    formData.set('csrf_token', options.csrf ?? '');
  }

  return new NextRequest('http://localhost/api/dashboard', {
    method: 'POST',
    body: formData,
    headers,
  });
}

function announcementLocation(response: Response): URL {
  return new URL(response.headers.get('location') ?? 'http://localhost/dashboard');
}

const eligibleHousehold = {
  id: 'household-a',
  label: 'Anne & Brian',
  contact_email: 'anne@example.com',
  gallery_announcement_sent_at: null,
  members: [{ full_name: 'Anne', attending_day1: true, attending_day2: false }],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = adminSecret;
  mocks.sql.mockResolvedValue([]);
  mocks.createGalleryCapability.mockResolvedValue({ token: 'gallery-token', expiresAt });
  mocks.createUploadPortalCapability.mockResolvedValue({
    token: `up_${'a'.repeat(43)}`,
    expiresAt,
  });
  mocks.revokeOtherUploadPortalCapabilities.mockResolvedValue(undefined);
  mocks.revokeUploadPortalCapability.mockResolvedValue(undefined);
  mocks.sendEmail.mockResolvedValue({ data: { id: 'message-id' }, error: null });
});

describe('Gallery announcement boundary', () => {
  it('sends one distinct message to a Gallery-eligible household, records success, and skips it on rerun', async () => {
    mocks.sql
      .mockResolvedValueOnce([eligibleHousehold])
      .mockResolvedValueOnce([{ id: 'household-a' }]);

    const response = await postDashboard(dashboardRequest('send_gallery_announcements'));
    const location = announcementLocation(response);
    const send = mocks.sendEmail.mock.calls[0]?.[0];

    expect(response.status).toBe(303);
    expect(location.pathname).toBe('/dashboard');
    expect(location.searchParams.get('announcement')).toBe('done');
    expect(location.searchParams.get('sent')).toBe('1');
    expect(location.searchParams.get('failed')).toBe('0');
    expect(send.to).toBe('anne@example.com');
    expect(send.subject).toContain('gallery');
    expect(send.html).toContain('gallery?token=gallery-token');
    expect(send.html).toContain(`upload?token=up_${'a'.repeat(43)}`);
    expect(send.html).not.toContain('household-a');
    expect(mocks.sendEmail.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: 'gallery-announcement:household-a',
    });
    expect(mocks.sql).toHaveBeenCalledWith(
      expect.anything(),
      'household-a',
    );

    mocks.sql.mockResolvedValueOnce([]);
    await postDashboard(dashboardRequest('send_gallery_announcements'));

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.createGalleryCapability).toHaveBeenCalledTimes(1);
  });

  it('excludes non-Gallery-eligible households, continues after provider failure, and records retryable failure', async () => {
    mocks.sql
      .mockResolvedValueOnce([
      eligibleHousehold,
      {
        id: 'not-attending',
        label: 'Not attending',
        contact_email: 'not-attending@example.com',
        gallery_announcement_sent_at: null,
        members: [{ full_name: 'No', attending_day1: false, attending_day2: false }],
      },
      {
        id: 'missing-attendance',
        label: 'Missing attendance',
        contact_email: 'missing@example.com',
        gallery_announcement_sent_at: null,
        members: [{ full_name: 'Maybe', attending_day1: null, attending_day2: null }],
      },
      {
        id: 'paper-household',
        label: 'Paper household',
        contact_email: '   ',
        gallery_announcement_sent_at: null,
        members: [{ full_name: 'Paper', attending_day1: true, attending_day2: true }],
      },
      {
        id: 'already-sent',
        label: 'Already sent',
        contact_email: 'sent@example.com',
        gallery_announcement_sent_at: '2026-09-18T12:00:00.000Z',
        members: [{ full_name: 'Sent', attending_day1: true, attending_day2: true }],
      },
      {
        id: 'second-eligible',
        label: 'Second eligible',
        contact_email: 'second@example.com',
        gallery_announcement_sent_at: null,
        members: [{ full_name: 'Second', attending_day1: false, attending_day2: true }],
      },
    ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'second-eligible' }]);
    mocks.sendEmail
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce({ data: { id: 'message-two' }, error: null });

    const response = await postDashboard(dashboardRequest('send_gallery_announcements'));
    const location = announcementLocation(response);

    expect(location.searchParams.get('sent')).toBe('1');
    expect(location.searchParams.get('failed')).toBe('1');
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendEmail.mock.calls.map(([message]) => message.to)).toEqual([
      'anne@example.com',
      'second@example.com',
    ]);
    expect(mocks.revokeUploadPortalCapability).not.toHaveBeenCalled();
    expect(mocks.revokeOtherUploadPortalCapabilities).not.toHaveBeenCalled();
    expect(mocks.sql.mock.calls[1].slice(1)).toEqual(expect.arrayContaining(['household-a', 'provider unavailable', true]));
  });

  it('keeps an accepted provider result retryable when success recording fails', async () => {
    mocks.sql
      .mockResolvedValueOnce([eligibleHousehold])
      .mockResolvedValueOnce([]);

    const response = await postDashboard(dashboardRequest('send_gallery_announcements'));
    const location = announcementLocation(response);

    expect(location.searchParams.get('sent')).toBe('0');
    expect(location.searchParams.get('failed')).toBe('1');
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.revokeUploadPortalCapability).not.toHaveBeenCalled();
    expect(mocks.sql.mock.calls[2].slice(1)).toEqual(expect.arrayContaining([
      'household-a',
      'Gallery announcement result could not be recorded',
      false,
    ]));
  });

  it.each([
    ['missing administrator session', { authenticated: false }],
    ['cross-origin request', { origin: 'https://attacker.example' }],
    ['invalid CSRF token', { csrf: 'invalid' }],
  ])('rejects announcement mutation for %s', async (_label, options) => {
    const response = await postDashboard(dashboardRequest('send_gallery_announcements', options));
    const location = announcementLocation(response);

    expect(location.searchParams.get('announcement')).toBe('unauthorized');
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
