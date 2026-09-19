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
