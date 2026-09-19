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
  options: { csrf?: string; cookie?: string; origin?: string; assetKey?: string } = {},
): NextRequest {
  const session = createAdminSessionToken(adminSecret);
  const form = new URLSearchParams({
    action,
    asset_key: options.assetKey ?? assetKey,
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

  it('publishes a pending submission exactly once', async () => {
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

  it('rejects a pending submission and deletes its private object', async () => {
    mocks.sql
      .mockResolvedValueOnce([{ id: 'asset-id', storage_key: 'gallery/asset.jpg', moderation_status: 'pending', cleanup_error: null }])
      .mockResolvedValueOnce([{ id: 'asset-id' }]);

    const response = await dashboardPost(request('reject_gallery_asset'));

    expect(location(response)).toBe('rejected');
    expect(mocks.del).toHaveBeenCalledWith('gallery/asset.jpg');
    expect(mocks.sql).toHaveBeenCalledTimes(3);
  });

  it('retries rejected cleanup without changing its moderation state', async () => {
    mocks.sql.mockResolvedValueOnce([
      { id: 'asset-id', storage_key: 'gallery/asset.jpg', moderation_status: 'rejected', cleanup_error: 'blob unavailable' },
    ]);

    const response = await dashboardPost(request('reject_gallery_asset'));

    expect(location(response)).toBe('already_rejected');
    expect(mocks.del).toHaveBeenCalledWith('gallery/asset.jpg');
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });

  it('does not remove a pending submission through the removal action', async () => {
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
    expect(mocks.del).toHaveBeenCalledWith('gallery/asset.mp4');
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
    expect(mocks.del).toHaveBeenCalledWith('gallery/asset.mp4');
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
});
