import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAdminSessionToken } from '../src/lib/adminSession';
import { createCsrfToken } from '../src/lib/csrf';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  del: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({ sql: mocks.sql }));
vi.mock('@vercel/blob', () => ({ del: mocks.del }));

import { POST as dashboardPost } from '../app/api/dashboard/route';

const adminSecret = 'moderation-secret';
const assetKey = 'asset-key-1234567890';

function request(
  action: string,
  options: { csrf?: string; cookie?: string; origin?: string; assetKey?: string; householdId?: string } = {},
): NextRequest {
  const session = createAdminSessionToken(adminSecret);
  const form = new URLSearchParams({
    action,
    asset_key: options.assetKey ?? assetKey,
    household_id: options.householdId ?? '',
    csrf_token: options.csrf ?? createCsrfToken(session, adminSecret),
  });
  return new NextRequest('http://localhost/api/dashboard', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: options.origin ?? 'http://localhost',
      cookie: options.cookie === undefined ? `admin_session=${session}` : options.cookie,
    },
    body: form.toString(),
  });
}

function location(response: Response): string {
  return new URL(response.headers.get('location') ?? '').searchParams.get('moderation') ?? '';
}

describe('dashboard moderation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = adminSecret;
    mocks.del.mockResolvedValue(undefined);
  });

  it('publishes a pending asset exactly once', async () => {
    mocks.sql
      .mockResolvedValueOnce([{ id: 'asset-id', storage_key: 'gallery/asset.jpg', moderation_status: 'pending', cleanup_error: null }])
      .mockResolvedValueOnce([{ id: 'asset-id' }]);

    const response = await dashboardPost(request('publish_gallery_asset'));

    expect(location(response)).toBe('published');
    expect(mocks.sql).toHaveBeenCalledTimes(2);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('treats repeated publish as an idempotent success without updating again', async () => {
    mocks.sql.mockResolvedValueOnce([{ id: 'asset-id', storage_key: 'gallery/asset.jpg', moderation_status: 'published', cleanup_error: null }]);

    const response = await dashboardPost(request('publish_gallery_asset'));

    expect(location(response)).toBe('already_published');
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it('rejects a pending asset and deletes its original and private thumbnail', async () => {
    mocks.sql
      .mockResolvedValueOnce([{
        id: 'asset-id',
        storage_key: 'gallery/asset.jpg',
        thumbnail_key: 'gallery/asset.preview.webp',
        moderation_status: 'pending',
        cleanup_error: null,
      }])
      .mockResolvedValueOnce([{ id: 'asset-id' }]);

    const response = await dashboardPost(request('reject_gallery_asset'));

    expect(location(response)).toBe('rejected');
    expect(mocks.del).toHaveBeenCalledWith(['gallery/asset.jpg', 'gallery/asset.preview.webp']);
    expect(mocks.sql).toHaveBeenCalledTimes(3);
  });

  it('retries rejected cleanup without changing its moderation state', async () => {
    mocks.sql.mockResolvedValueOnce([
      {
        id: 'asset-id',
        storage_key: 'gallery/asset.jpg',
        thumbnail_key: 'gallery/asset.preview.webp',
        moderation_status: 'rejected',
        cleanup_error: 'blob unavailable',
      },
    ]);

    const response = await dashboardPost(request('reject_gallery_asset'));

    expect(location(response)).toBe('already_rejected');
    expect(mocks.del).toHaveBeenCalledWith(['gallery/asset.jpg', 'gallery/asset.preview.webp']);
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });

  it('does not remove a pending asset through the removal action', async () => {
    mocks.sql.mockResolvedValueOnce([{ id: 'asset-id', storage_key: 'gallery/asset.jpg', moderation_status: 'pending', cleanup_error: null }]);

    const response = await dashboardPost(request('remove_gallery_asset'));

    expect(location(response)).toBe('invalid_transition');
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it('removes a published asset and cleans up its private object', async () => {
    mocks.sql
      .mockResolvedValueOnce([{ id: 'asset-id', storage_key: 'gallery/asset.mp4', moderation_status: 'published', cleanup_error: null }])
      .mockResolvedValueOnce([{ id: 'asset-id' }]);

    const response = await dashboardPost(request('remove_gallery_asset'));

    expect(location(response)).toBe('removed');
    expect(mocks.del).toHaveBeenCalledWith(['gallery/asset.mp4']);
    expect(mocks.sql).toHaveBeenCalledTimes(3);
  });

  it('keeps a removal idempotent and retries failed cleanup only when needed', async () => {
    mocks.sql.mockResolvedValueOnce([{ id: 'asset-id', storage_key: 'gallery/asset.mp4', moderation_status: 'removed', cleanup_error: null }]);

    const response = await dashboardPost(request('remove_gallery_asset'));

    expect(location(response)).toBe('already_removed');
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it('keeps the asset hidden when storage deletion fails', async () => {
    mocks.sql
      .mockResolvedValueOnce([{ id: 'asset-id', storage_key: 'gallery/asset.mp4', moderation_status: 'published', cleanup_error: null }])
      .mockResolvedValueOnce([{ id: 'asset-id' }]);
    mocks.del.mockRejectedValueOnce(new Error('blob unavailable'));

    const response = await dashboardPost(request('remove_gallery_asset'));

    expect(location(response)).toBe('cleanup_failed');
    expect(mocks.del).toHaveBeenCalledWith(['gallery/asset.mp4']);
    expect(mocks.sql).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['unauthenticated', { cookie: '' }],
    ['cross-origin', { origin: 'https://attacker.example' }],
    ['invalid csrf', { csrf: 'invalid' }],
  ])('rejects %s moderation mutations', async (_label, options) => {
    const response = await dashboardPost(request('publish_gallery_asset', options));

    expect(location(response)).toBe('unauthorized');
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('rejects malformed asset keys before database access', async () => {
    const response = await dashboardPost(request('publish_gallery_asset', { assetKey: 'bad' }));

    expect(location(response)).toBe('invalid_asset');
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('rotates one household Gallery link and returns the replacement outside the URL', async () => {
    const householdId = '123e4567-e89b-12d3-a456-426614174001';
    mocks.sql.mockResolvedValueOnce([{ id: 'new-capability-id' }]);

    const response = await dashboardPost(request('rotate_gallery_link', { householdId }));
    const replacement = new URL((await response.text()).trim());
    const rotationCall = mocks.sql.mock.calls[0] as unknown[];
    const rotationQuery = (rotationCall[0] as TemplateStringsArray).join('');
    const token = replacement.searchParams.get('token') ?? '';

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(replacement.pathname).toBe('/gallery');
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,256}$/);
    expect(rotationQuery).not.toContain('FOR UPDATE OF h');
    expect(rotationQuery).toContain('UPDATE gallery_capabilities');
    expect(rotationQuery).toContain('INSERT INTO gallery_capabilities');
    expect(rotationQuery).toContain('WHERE household_id =');
    expect(rotationQuery).toContain("NULLIF(BTRIM(h.contact_email), '') IS NOT NULL");
    expect(rotationQuery).toContain('eligible_member.attending_day1 IS TRUE OR eligible_member.attending_day2 IS TRUE');
    expect(rotationCall).toContain(householdId);
    expect(rotationCall).not.toContain(token);
  });

  it('does not reveal a replacement for a household that is no longer eligible', async () => {
    mocks.sql.mockResolvedValueOnce([]);

    const response = await dashboardPost(request('rotate_gallery_link', {
      householdId: '123e4567-e89b-12d3-a456-426614174001',
    }));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Household not found');
    expect(response.headers.get('location')).toBeNull();
  });

  it.each([
    ['missing administrator session', { cookie: '' }],
    ['cross-origin request', { origin: 'https://attacker.example' }],
    ['invalid CSRF token', { csrf: 'invalid' }],
  ])('rejects Gallery-link rotation for %s', async (_label, options) => {
    const response = await dashboardPost(request('rotate_gallery_link', options));

    expect(response.status).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('rejects malformed household IDs before rotating Gallery links', async () => {
    const response = await dashboardPost(request('rotate_gallery_link', { householdId: 'not-a-uuid' }));

    expect(response.status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
