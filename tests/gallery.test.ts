import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GALLERY_SIGNED_URL_TTL_SECONDS } from '../src/lib/galleryConfig';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  checkRateLimit: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({ sql: mocks.sql }));
vi.mock('../src/lib/rateLimit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@vercel/blob', () => ({
  issueSignedToken: mocks.issueSignedToken,
  presignUrl: mocks.presignUrl,
}));

import { GET as listGallery } from '../app/api/gallery/route';
import { GET as getAssetUrl } from '../app/api/gallery/assets/[assetKey]/url/route';

const galleryToken = 'a'.repeat(43);

function request(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { 'x-forwarded-for': '198.51.100.10' },
  });
}

describe('gallery viewer boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(true);
  });

  it('returns only published assets for a valid Gallery link', async () => {
    mocks.sql
      .mockResolvedValueOnce([{ id: 'gallery-capability' }])
      .mockResolvedValueOnce([
      {
        public_key: 'published-photo',
        media_type: 'photo',
        content_type: 'image/jpeg',
        size_bytes: '2048',
        display_name: 'Published photo.jpg',
        created_at: '2026-09-19T12:00:00.000Z',
        moderation_status: 'published',
      },
      {
        public_key: 'pending-photo',
        media_type: 'photo',
        content_type: 'image/jpeg',
        size_bytes: '2048',
        display_name: 'Pending photo.jpg',
        created_at: '2026-09-19T11:00:00.000Z',
        moderation_status: 'pending',
      },
      {
        public_key: 'rejected-photo',
        media_type: 'photo',
        content_type: 'image/jpeg',
        size_bytes: '2048',
        display_name: 'Rejected photo.jpg',
        created_at: '2026-09-19T10:00:00.000Z',
        moderation_status: 'rejected',
      },
      {
        public_key: 'removed-photo',
        media_type: 'photo',
        content_type: 'image/jpeg',
        size_bytes: '2048',
        display_name: 'Removed photo.jpg',
        created_at: '2026-09-19T09:00:00.000Z',
        moderation_status: 'removed',
      },
    ]);

    const response = await listGallery(request(`/api/gallery?token=${galleryToken}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets).toEqual([
      {
        asset_key: 'published-photo',
        media_type: 'photo',
        content_type: 'image/jpeg',
        size_bytes: 2048,
        display_name: 'Published photo.jpg',
        created_at: '2026-09-19T12:00:00.000Z',
      },
    ]);
    expect(body.assets[0]).not.toHaveProperty('storage_key');
  });

  it('rejects missing and malformed Gallery links', async () => {
    for (const path of ['/api/gallery', '/api/gallery?token=malformed']) {
      const response = await listGallery(request(path));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Invalid Gallery link' });
    }
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('rejects malformed gallery cursors', async () => {
    mocks.sql.mockResolvedValueOnce([{ id: 'gallery-capability' }]);

    const response = await listGallery(request(`/api/gallery?token=${galleryToken}&cursor=not-base64`));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid gallery cursor' });
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });


  it.each(['expired', 'revoked'])('rejects %s Gallery links', async () => {
    mocks.sql.mockResolvedValueOnce([]);

    const response = await listGallery(request(`/api/gallery?token=${galleryToken}`));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Invalid Gallery link' });
  });

  it('issues a short-lived private direct URL for one published asset', async () => {
    mocks.sql
      .mockResolvedValueOnce([{ id: 'gallery-capability' }])
      .mockResolvedValueOnce([{ storage_key: 'gallery/published-photo.jpg' }]);
    mocks.issueSignedToken.mockResolvedValue({
      delegationToken: 'delegation',
      clientSigningToken: 'signing',
      validUntil: Date.now() + 300_000,
    });
    mocks.presignUrl.mockResolvedValue({
      presignedUrl: 'https://store.private.blob.vercel-storage.com/gallery/published-photo.jpg?signature=1',
    });

    const response = await getAssetUrl(
      request(`/api/gallery/assets/published-photo/url?token=${galleryToken}&download=1`),
      { params: { assetKey: 'published-photo' } },
    );
    const body = await response.json();
    const expiresAt = Date.parse(body.expires_at);
    const remainingLifetime = expiresAt - Date.now();

    expect(response.status).toBe(200);
    expect(body.url).toContain('.private.blob.vercel-storage.com/');
    expect(body.url).toContain('download=1');
    expect(remainingLifetime).toBeGreaterThan(0);
    expect(remainingLifetime).toBeLessThanOrEqual(GALLERY_SIGNED_URL_TTL_SECONDS * 1000 + 1000);
    expect(mocks.issueSignedToken).toHaveBeenCalledWith(expect.objectContaining({
      pathname: 'gallery/published-photo.jpg',
      operations: ['get'],
    }));
    expect(mocks.presignUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ access: 'private', operation: 'get', pathname: 'gallery/published-photo.jpg' }),
    );
  });
  it('paginates published assets with a stable oldest-first cursor', async () => {
    const pagedAssets = Array.from({ length: 25 }, (_, index) => ({
      public_key: `published-photo-${index}`,
      media_type: 'photo',
      content_type: 'image/jpeg',
      size_bytes: '2048',
      display_name: `Published photo ${index}.jpg`,
      created_at: new Date(Date.parse('2026-09-19T12:00:00.000Z') + index * 60_000).toISOString(),
      moderation_status: 'published',
    }));
    mocks.sql
      .mockResolvedValueOnce([{ id: 'gallery-capability' }])
      .mockResolvedValueOnce(pagedAssets);

    const firstResponse = await listGallery(request(`/api/gallery?token=${galleryToken}`));
    const firstBody = await firstResponse.json();
    const firstQuery = mocks.sql.mock.calls[1] as unknown[];
    const firstQueryText = (firstQuery[0] as TemplateStringsArray).join('');

    expect(firstResponse.status).toBe(200);
    expect(firstBody.assets).toHaveLength(24);
    expect(firstBody.next_cursor).toEqual(expect.any(String));
    expect(firstQueryText).toContain('ORDER BY created_at ASC, public_key ASC');
    expect(JSON.parse(Buffer.from(firstBody.next_cursor, 'base64url').toString('utf8'))).toEqual({
      createdAt: pagedAssets[23].created_at,
      assetKey: 'published-photo-23',
    });

    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.sql
      .mockResolvedValueOnce([{ id: 'gallery-capability' }])
      .mockResolvedValueOnce(pagedAssets.slice(24));

    const secondResponse = await listGallery(
      request(`/api/gallery?token=${galleryToken}&cursor=${firstBody.next_cursor}`),
    );
    const secondBody = await secondResponse.json();
    const secondQuery = mocks.sql.mock.calls[1] as unknown[];
    const secondQueryText = (secondQuery[0] as TemplateStringsArray).join('');

    expect(secondResponse.status).toBe(200);
    expect(secondBody.assets).toHaveLength(1);
    expect(secondBody.assets[0].asset_key).toBe('published-photo-24');
    expect(secondBody.next_cursor).toBeNull();
    expect(secondQueryText).toContain('AND (created_at, public_key) > (');
    expect(secondQuery).toContain(pagedAssets[23].created_at);
    expect(secondQuery).toContain('published-photo-23');
  });


  it('does not issue a URL for a Pending submission or missing asset', async () => {
    mocks.sql
      .mockResolvedValueOnce([{ id: 'gallery-capability' }])
      .mockResolvedValueOnce([]);

    const response = await getAssetUrl(
      request(`/api/gallery/assets/pending-photo/url?token=${galleryToken}`),
      { params: { assetKey: 'pending-photo' } },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Asset unavailable' });
    expect(mocks.issueSignedToken).not.toHaveBeenCalled();
  });
});
