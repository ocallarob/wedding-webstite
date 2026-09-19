import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAdminSessionToken } from '../src/lib/adminSession';
import { createCsrfToken } from '../src/lib/csrf';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  checkRateLimit: vi.fn(),
  sendEmail: vi.fn(),
  handleUpload: vi.fn(),
  head: vi.fn(),
  del: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({ sql: mocks.sql }));
vi.mock('../src/lib/rateLimit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@vercel/blob', () => ({
  head: mocks.head,
  del: mocks.del,
}));
vi.mock('@vercel/blob/client', () => ({ handleUpload: mocks.handleUpload }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.sendEmail };
  },
}));

import { GET as getUploadPortal, POST as postUpload } from '../app/api/upload/route';
import { POST as postDashboard } from '../app/api/dashboard/route';

const validToken = `up_${'a'.repeat(43)}`;
type AdminRequestOptions = { authenticated?: boolean; origin?: string };

function getRequest(token: string): NextRequest {
  return new NextRequest(`http://localhost/api/upload?token=${encodeURIComponent(token)}`, {
    headers: { 'x-forwarded-for': '198.51.100.10' },
  });
}

function uploadRequest(token: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/upload?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.10',
    },
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

  it('creates a bounded upload session without exposing household details', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mocks.sql
      .mockResolvedValueOnce([{
        household_id: 'household-a',
        expires_at: expiresAt,
        revoked_at: null,
        contact_available: true,
      }])
      .mockResolvedValueOnce([{ id: '550e8400-e29b-41d4-a716-446655440000', expires_at: expiresAt }]);

    const response = await postUpload(uploadRequest(validToken, {
      action: 'initiate',
      assets: [
        { name: 'ceremony.jpg', content_type: 'image/jpeg', size_bytes: 2048 },
        { name: 'speeches.mp4', content_type: 'video/mp4', size_bytes: 4096 },
      ],
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ upload_session_id: '550e8400-e29b-41d4-a716-446655440000', expires_at: expiresAt });
    expect(JSON.stringify(body)).not.toContain('household-a');
  });

  it('rejects unsupported assets before creating storage work', async () => {
    const response = await postUpload(uploadRequest(validToken, {
      action: 'initiate',
      assets: [{ name: 'notes.txt', content_type: 'text/plain', size_bytes: 100 }],
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Some selected assets are invalid');
    expect(body.errors).toEqual([{ index: 0, message: expect.stringContaining('not supported') }]);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('issues a constrained private upload token only for the authorized household session', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mocks.sql
      .mockResolvedValueOnce([{
        household_id: 'household-a',
        expires_at: expiresAt,
        revoked_at: null,
        contact_available: true,
      }])
      .mockResolvedValueOnce([{ expires_at: expiresAt }]);
    mocks.handleUpload.mockImplementation(async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: Function }) => {
      await onBeforeGenerateToken(
        'guest-submissions/550e8400-e29b-41d4-a716-446655440000/ceremony.jpg',
        JSON.stringify({
          session_id: '550e8400-e29b-41d4-a716-446655440000',
          display_name: 'ceremony.jpg',
          content_type: 'image/jpeg',
          size_bytes: 2048,
        }),
        false,
      );
      return { type: 'blob.generate-client-token', clientToken: 'client-token' };
    });

    const response = await postUpload(uploadRequest(validToken, {
      type: 'blob.generate-client-token',
      payload: {
        pathname: 'guest-submissions/550e8400-e29b-41d4-a716-446655440000/ceremony.jpg',
        clientPayload: JSON.stringify({
          session_id: '550e8400-e29b-41d4-a716-446655440000',
          display_name: 'ceremony.jpg',
          content_type: 'image/jpeg',
          size_bytes: 2048,
        }),
        multipart: false,
      },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 'blob.generate-client-token', clientToken: 'client-token' });
  });

  it('records a completed private upload as a Pending submission for its session household', async () => {
    mocks.sql
      .mockResolvedValueOnce([{ household_id: 'household-a', expires_at: new Date(Date.now() + 60_000).toISOString() }])
      .mockResolvedValueOnce([{ id: 'asset-a' }])
      .mockResolvedValueOnce([]);
    mocks.head.mockResolvedValue({
      pathname: 'guest-submissions/550e8400-e29b-41d4-a716-446655440000/ceremony-abc.jpg',
      contentType: 'image/jpeg',
      size: 2048,
    });
    mocks.handleUpload.mockImplementation(async ({ body, onUploadCompleted }: { body: { payload: unknown }; onUploadCompleted: Function }) => {
      await onUploadCompleted(body.payload);
      return { type: 'blob.upload-completed', response: 'ok' };
    });

    const response = await postUpload(uploadRequest(validToken, {
      type: 'blob.upload-completed',
      payload: {
        blob: {
          pathname: 'guest-submissions/550e8400-e29b-41d4-a716-446655440000/ceremony-abc.jpg',
          contentType: 'image/jpeg',
          url: 'https://private.blob.vercel-storage.com/secret',
        },
        tokenPayload: JSON.stringify({
          session_id: '550e8400-e29b-41d4-a716-446655440000',
          pathname: 'guest-submissions/550e8400-e29b-41d4-a716-446655440000/ceremony.jpg',
          display_name: 'ceremony.jpg',
          content_type: 'image/jpeg',
          size_bytes: 2048,
        }),
      },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 'blob.upload-completed', response: 'ok' });
    expect(mocks.head).toHaveBeenCalledWith('guest-submissions/550e8400-e29b-41d4-a716-446655440000/ceremony-abc.jpg');
    expect(mocks.sql).toHaveBeenCalledTimes(3);
  });

  it('confirms a direct upload only for the authorized session and returns awaiting review', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    mocks.sql
      .mockResolvedValueOnce([{
        household_id: 'household-a',
        expires_at: expiresAt,
        revoked_at: null,
        contact_available: true,
      }])
      .mockResolvedValueOnce([{ household_id: 'household-a' }])
      .mockResolvedValueOnce([{ household_id: 'household-a' }])
      .mockResolvedValueOnce([{ id: 'asset-a' }])
      .mockResolvedValueOnce([]);
    mocks.head.mockResolvedValue({
      pathname: 'guest-submissions/550e8400-e29b-41d4-a716-446655440000/ceremony-abc.jpg',
      contentType: 'image/jpeg',
      size: 2048,
    });
    mocks.handleUpload.mockImplementation(async ({ body, onUploadCompleted }: { body: { payload: unknown }; onUploadCompleted: Function }) => {
      await onUploadCompleted(body.payload);
      return { type: 'blob.upload-completed', response: 'ok' };
    });

    const response = await postUpload(uploadRequest(validToken, {
      action: 'confirm',
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      pathname: 'guest-submissions/550e8400-e29b-41d4-a716-446655440000/ceremony-abc.jpg',
      display_name: 'ceremony.jpg',
      content_type: 'image/jpeg',
      size_bytes: 2048,
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: 'pending', awaiting_review: true });
  });

  it('rejects a visit that exceeds the configured asset-count limit before storage work', async () => {
    const response = await postUpload(uploadRequest(validToken, {
      action: 'initiate',
      assets: Array.from({ length: 21 }, (_, index) => ({
        name: `photo-${index}.jpg`,
        content_type: 'image/jpeg',
        size_bytes: 2048,
      })),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Some selected assets are invalid',
      errors: [{ index: 0, message: 'You can contribute up to 20 assets per visit.' }],
    });
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('returns a safe actionable response when the storage provider fails', async () => {
    mocks.handleUpload.mockRejectedValue(new Error('provider secret details'));

    const response = await postUpload(uploadRequest(validToken, {
      type: 'blob.upload-completed',
      payload: {
        blob: { pathname: 'guest-submissions/550e8400-e29b-41d4-a716-446655440000/photo.jpg' },
        tokenPayload: JSON.stringify({ session_id: '550e8400-e29b-41d4-a716-446655440000' }),
      },
    }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: 'Upload provider unavailable. Try again shortly.' });
    expect(JSON.stringify(body)).not.toContain('provider secret details');
  });

  it('rate-limits upload callbacks without exposing provider details', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const response = await postUpload(uploadRequest(validToken, {
      type: 'blob.upload-completed',
      payload: {
        blob: { pathname: 'guest-submissions/path/photo.jpg' },
        tokenPayload: JSON.stringify({ session_id: '550e8400-e29b-41d4-a716-446655440000' }),
      },
    }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Too many upload callbacks' });
    expect(mocks.handleUpload).not.toHaveBeenCalled();
  });
});
