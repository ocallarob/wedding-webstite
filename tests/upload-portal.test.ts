import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAdminSessionToken } from '../src/lib/adminSession';
import { createCsrfToken } from '../src/lib/csrf';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  checkRateLimit: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({ sql: mocks.sql }));
vi.mock('../src/lib/rateLimit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.sendEmail };
  },
}));

import { GET as getUploadPortal } from '../app/api/upload/route';
import { POST as postDashboard } from '../app/api/dashboard/route';

const validToken = `up_${'a'.repeat(43)}`;
type AdminRequestOptions = { authenticated?: boolean; origin?: string };

function getRequest(token: string): NextRequest {
  return new NextRequest(`http://localhost/api/upload?token=${encodeURIComponent(token)}`, {
    headers: { 'x-forwarded-for': '198.51.100.10' },
  });
}

function adminRequest(fields: Record<string, string>, options: { authenticated?: boolean; origin?: string } = {}): NextRequest {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);

  const headers = new Headers({ origin: options.origin ?? 'http://localhost' });
  if (options.authenticated !== false) {
    const session = createAdminSessionToken('admin-secret');
    headers.set('cookie', `admin_session=${session}`);
  }

  return new NextRequest('http://localhost/api/dashboard', {
    method: 'POST',
    body: formData,
    headers,
  });
}

function csrfForRequest(request: NextRequest): string {
  const session = request.cookies.get('admin_session')?.value;
  if (!session) return '';
  return createCsrfToken(session, 'admin-secret');
}

describe('Upload portal boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = 'admin-secret';
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.sql.mockResolvedValue([]);
    mocks.sendEmail.mockResolvedValue({ data: { id: 'message-id' }, error: null });
  });

  it('authorizes a valid portal without exposing household details', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mocks.sql.mockResolvedValue([
      {
        household_id: 'household-a',
        expires_at: expiresAt,
        revoked_at: null,
        contact_available: true,
      },
    ]);

    const response = await getUploadPortal(getRequest(validToken));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authorized).toBe(true);
    expect(body.expires_at).toBe(expiresAt);
    expect(body).not.toHaveProperty('household_id');
    expect(JSON.stringify(body)).not.toContain('household-a');
  });

  it('returns a distinct expired state while keeping revoked and unknown links safe', async () => {
    mocks.sql.mockResolvedValue([
      {
        household_id: 'household-a',
        expires_at: '2020-12-01T00:00:00.000Z',
        revoked_at: null,
        contact_available: true,
      },
    ]);

    const expiredResponse = await getUploadPortal(getRequest(validToken));
    expect(expiredResponse.status).toBe(410);
    expect(await expiredResponse.json()).toEqual({ error: 'Upload portal link expired' });

    mocks.sql.mockResolvedValue([
      {
        household_id: 'household-a',
        expires_at: '2026-12-01T00:00:00.000Z',
        revoked_at: '2026-01-01T00:00:00.000Z',
        contact_available: true,
      },
    ]);
    const revokedResponse = await getUploadPortal(getRequest(validToken));
    expect(revokedResponse.status).toBe(404);
    expect(await revokedResponse.json()).toEqual({ error: 'Invalid Upload portal link' });

    mocks.sql.mockResolvedValue([]);
    const unknownResponse = await getUploadPortal(getRequest(validToken));
    expect(unknownResponse.status).toBe(404);
    expect(await unknownResponse.json()).toEqual({ error: 'Invalid Upload portal link' });
  });

  it('rejects malformed and RSVP tokens with a safe response', async () => {
    for (const token of ['', '00000000-0000-0000-0000-000000000000']) {
      const response = await getUploadPortal(getRequest(token));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Invalid Upload portal link' });
    }
  });

  it('returns a stable rate-limit response before checking capability state', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const response = await getUploadPortal(getRequest(validToken));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Too many requests' });
  });

  it('lets an authorized administrator generate a portal link without a household id in it', async () => {
    const request = adminRequest({ action: 'generate_upload_portal', household_id: 'household-a' });
    const formData = await request.formData();
    formData.set('csrf_token', csrfForRequest(request));
    const authenticatedRequest = new NextRequest(request.url, {
      method: 'POST',
      body: formData,
      headers: { origin: 'http://localhost', cookie: request.headers.get('cookie') ?? '' },
    });

    mocks.sql.mockResolvedValue([{ id: 'new-capability' }]);
    const response = await postDashboard(authenticatedRequest);
    const location = response.headers.get('location') ?? '';
    const token = new URL(location).searchParams.get('upload_token');

    expect(response.status).toBe(307);
    expect(location).toContain('/dashboard?upload=done');
    expect(token).toBeTruthy();
    expect(location).not.toContain('household-a');
  });

  it('does not generate a portal for a household without a contact email', async () => {
    const request = adminRequest({ action: 'generate_upload_portal', household_id: 'paper-household' });
    const formData = await request.formData();
    formData.set('csrf_token', csrfForRequest(request));
    const authenticatedRequest = new NextRequest(request.url, {
      method: 'POST',
      body: formData,
      headers: { origin: 'http://localhost', cookie: request.headers.get('cookie') ?? '' },
    });

    const response = await postDashboard(authenticatedRequest);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('upload=failed');
  });

  it('resends a fresh capability to the household contact', async () => {
    const request = adminRequest({ action: 'resend_upload_portal', household_id: 'household-a' });
    const formData = await request.formData();
    formData.set('csrf_token', csrfForRequest(request));
    const authenticatedRequest = new NextRequest(request.url, {
      method: 'POST',
      body: formData,
      headers: { origin: 'http://localhost', cookie: request.headers.get('cookie') ?? '' },
    });
    mocks.sql
      .mockResolvedValueOnce([{ contact_email: 'contact@example.com' }])
      .mockResolvedValueOnce([{ id: 'new-capability' }])
      .mockResolvedValueOnce([]);

    const response = await postDashboard(authenticatedRequest);
    const location = response.headers.get('location') ?? '';
    const send = mocks.sendEmail.mock.calls[0]?.[0];

    expect(response.status).toBe(307);
    expect(location).toContain('/dashboard?upload=sent');
    expect(send.to).toBe('contact@example.com');
    expect(send.subject).toContain('Upload portal');
    expect(send.html).toContain('/upload?token=');
  });

  it('revokes a household portal with an authorized administrator session', async () => {
    const request = adminRequest({ action: 'revoke_upload_portal', household_id: 'household-a' });
    const formData = await request.formData();
    formData.set('csrf_token', csrfForRequest(request));
    const authenticatedRequest = new NextRequest(request.url, {
      method: 'POST',
      body: formData,
      headers: { origin: 'http://localhost', cookie: request.headers.get('cookie') ?? '' },
    });

    const response = await postDashboard(authenticatedRequest);
    const location = response.headers.get('location') ?? '';

    expect(response.status).toBe(307);
    expect(location).toContain('/dashboard?upload=revoked');
  });

  it.each<[string, AdminRequestOptions, string]>([
    ['missing administrator session', { authenticated: false }, 'csrf'],
    ['invalid CSRF token', { authenticated: true }, 'bad-csrf'],
    ['cross-origin request', { authenticated: true, origin: 'https://attacker.example' }, 'csrf'],
  ])('rejects capability mutation for %s', async (_label, options, csrfValue) => {
    const request = adminRequest({ action: 'generate_upload_portal', household_id: 'household-a' }, options);
    const formData = await request.formData();
    formData.set('csrf_token', options.authenticated === false ? '' : csrfValue === 'csrf' ? csrfForRequest(request) : csrfValue);
    const protectedRequest = new NextRequest(request.url, {
      method: 'POST',
      body: formData,
      headers: { origin: options.origin ?? 'http://localhost', cookie: request.headers.get('cookie') ?? '' },
    });

    const response = await postDashboard(protectedRequest);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('error=unauthorized');
  });
});
