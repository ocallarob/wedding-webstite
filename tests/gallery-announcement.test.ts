import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAdminSessionToken } from '../src/lib/adminSession';
import { createCsrfToken } from '../src/lib/csrf';
import { buildInviteEmailSubject } from '../src/lib/inviteEmailHtml';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  sendEmail: vi.fn(),
  createGalleryCapability: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({ sql: mocks.sql }));
vi.mock('../src/lib/galleryCapabilities', () => ({ createGalleryCapability: mocks.createGalleryCapability }));
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
  options: { authenticated?: boolean; origin?: string; csrf?: string; to?: string; householdId?: string } = {},
): NextRequest {
  const formData = new FormData();
  formData.set('action', action);
  if (options.to !== undefined) formData.set('to', options.to);
  if (options.householdId !== undefined) formData.set('household_id', options.householdId);
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
  mocks.sendEmail.mockResolvedValue({ data: { id: 'message-id' }, error: null });
});

describe('Gallery announcement boundary', () => {
  it('sends a test only to the supplied recipient without recording or claiming announcements', async () => {
    const householdId = '123e4567-e89b-12d3-a456-426614174001';
    mocks.sql.mockResolvedValueOnce([{ ...eligibleHousehold, id: householdId }]);
    const response = await postDashboard(dashboardRequest('send_gallery_test', {
      to: ' rob@example.com ',
      householdId,
    }));
    expect(announcementLocation(response).searchParams.get('announcement')).toBe('test_sent');
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const message = mocks.sendEmail.mock.calls[0][0];
    expect(message.to).toBe('rob@example.com');
    expect(message.subject).toMatch(/^\[Test\] /);
    expect(message.html).toContain('gallery?token=gallery-token');
    expect(message.html).toContain('Anne &amp; Brian');
    expect(mocks.createGalleryCapability).toHaveBeenCalledWith(householdId);
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it.each([
    { authenticated: false },
    { origin: 'https://attacker.example' },
    { csrf: 'invalid' },
  ])('rejects unauthorized test sends: %j', async (options) => {
    const response = await postDashboard(dashboardRequest('send_gallery_test', {
      to: 'rob@example.com',
      householdId: '123e4567-e89b-12d3-a456-426614174001',
      ...options,
    }));
    expect(announcementLocation(response).searchParams.get('announcement')).toBe('unauthorized');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.createGalleryCapability).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it.each(['', 'invalid', 'one@example.com,two@example.com', 'one@example.com;two@example.com'])('rejects invalid test recipient %s', async (to) => {
    const response = await postDashboard(dashboardRequest('send_gallery_test', {
      to,
      householdId: '123e4567-e89b-12d3-a456-426614174001',
    }));
    expect(announcementLocation(response).searchParams.get('announcement')).toBe('test_invalid');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('rejects an ineligible test household without issuing a link or sending', async () => {
    mocks.sql.mockResolvedValueOnce([{ ...eligibleHousehold, members: [] }]);
    const response = await postDashboard(dashboardRequest('send_gallery_test', {
      to: 'rob@example.com',
      householdId: '123e4567-e89b-12d3-a456-426614174001',
    }));
    expect(announcementLocation(response).searchParams.get('announcement')).toBe('test_invalid');
    expect(mocks.createGalleryCapability).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('reports a provider rejection without changing announcement status', async () => {
    mocks.sql.mockResolvedValueOnce([eligibleHousehold]);
    mocks.sendEmail.mockResolvedValueOnce({ data: null, error: { message: 'Rejected' } });
    const response = await postDashboard(dashboardRequest('send_gallery_test', {
      to: 'rob@example.com',
      householdId: '123e4567-e89b-12d3-a456-426614174001',
    }));
    expect(announcementLocation(response).searchParams.get('announcement')).toBe('test_failed');
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

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
    expect(send.subject).not.toBe(buildInviteEmailSubject());
    expect(send.html).toContain('gallery?token=gallery-token');
    expect(send.html).toContain('WhatsApp');
    expect(send.html).not.toContain('mailto:');
    expect(send.html).not.toContain('hello@alannah-rob.ie');
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

  it('issues a separate Gallery link for each eligible household', async () => {
    const secondHousehold = {
      id: 'household-b',
      label: 'Casey & Drew',
      contact_email: 'casey@example.com',
      gallery_announcement_sent_at: null,
      members: [{ full_name: 'Casey', attending_day1: false, attending_day2: true }],
    };
    const tokenA = 'a'.repeat(43);
    const tokenB = 'b'.repeat(43);
    mocks.sql
      .mockResolvedValueOnce([eligibleHousehold, secondHousehold])
      .mockResolvedValueOnce([{ id: 'household-a' }])
      .mockResolvedValueOnce([{ id: 'household-b' }]);
    mocks.createGalleryCapability
      .mockResolvedValueOnce({ token: tokenA, expiresAt })
      .mockResolvedValueOnce({ token: tokenB, expiresAt });

    await postDashboard(dashboardRequest('send_gallery_announcements'));

    const messages = mocks.sendEmail.mock.calls.map(([message]) => message);
    expect(messages.map((message) => message.to)).toEqual([
      'anne@example.com',
      'casey@example.com',
    ]);
    expect(messages[0].html).toContain(`gallery?token=${tokenA}`);
    expect(messages[0].html).not.toContain(tokenB);
    expect(messages[1].html).toContain(`gallery?token=${tokenB}`);
    expect(messages[1].html).not.toContain(tokenA);
    expect(mocks.createGalleryCapability.mock.calls).toEqual([
      ['household-a'],
      ['household-b'],
    ]);
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
