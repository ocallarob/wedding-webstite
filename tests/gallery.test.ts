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
const householdId = '123e4567-e89b-12d3-a456-426614174001';
const assetId = '123e4567-e89b-12d3-a456-426614174002';

function request(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { 'x-forwarded-for': '198.51.100.10', ...headers },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}


describe('gallery viewer boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.issueSignedToken.mockResolvedValue({
      delegationToken: 'delegation',
      clientSigningToken: 'signing',
      validUntil: Date.now() + 300_000,
    });
    mocks.presignUrl.mockResolvedValue({
      presignedUrl: 'https://store.private.blob.vercel-storage.com/preview.webp?signature=1',
    });
  });

  it('returns only published assets for a valid Gallery link', async () => {
    mocks.sql
      .mockResolvedValueOnce([{ household_id: householdId }])
      .mockResolvedValueOnce([
      {
        public_key: 'published-photo',
        media_type: 'photo',
        photo_source: 'guest',
        storage_key: 'gallery/published-photo.jpg',
        thumbnail_key: 'gallery/published-photo.preview.webp',
        content_type: 'image/jpeg',
        size_bytes: '2048',
        display_name: 'Published photo.jpg',
        created_at: '2026-09-19T12:00:00.000Z',
        position: 1,
        moderation_status: 'published',
      },
      {
        public_key: 'pending-photo',
        media_type: 'photo',
        photo_source: 'guest',
        content_type: 'image/jpeg',
        size_bytes: '2048',
        display_name: 'Pending photo.jpg',
        created_at: '2026-09-19T11:00:00.000Z',
        moderation_status: 'pending',
      },
      {
        public_key: 'rejected-photo',
        media_type: 'photo',
        photo_source: 'guest',
        content_type: 'image/jpeg',
        size_bytes: '2048',
        display_name: 'Rejected photo.jpg',
        created_at: '2026-09-19T10:00:00.000Z',
        moderation_status: 'rejected',
      },
      {
        public_key: 'removed-photo',
        media_type: 'photo',
        photo_source: 'guest',
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
        photo_source: 'guest',
        content_type: 'image/jpeg',
        size_bytes: 2048,
        display_name: 'Published photo.jpg',
        created_at: '2026-09-19T12:00:00.000Z',
        preview_url: 'https://store.private.blob.vercel-storage.com/preview.webp?signature=1',
      },
    ]);
    expect(body.assets[0]).not.toHaveProperty('storage_key');
    expect(body.assets[0]).not.toHaveProperty('thumbnail_key');
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
    mocks.sql.mockResolvedValueOnce([{ household_id: householdId }]);

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
      .mockResolvedValueOnce([{ household_id: householdId }])
      .mockResolvedValueOnce([{ id: assetId, storage_key: 'gallery/published-photo.jpg' }]);
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
    expect(mocks.presignUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ useCache: false }),
    );
    const activityCall = mocks.sql.mock.calls[2] as unknown[];
    const activityQuery = (activityCall[0] as TemplateStringsArray).join('');
    expect(activityQuery).toContain("'download_request'");
    expect(activityCall.slice(1)).toEqual([householdId, assetId]);
  });

  it('refreshes a preview URL from the thumbnail without counting a download request', async () => {
    mocks.sql
      .mockResolvedValueOnce([{ household_id: householdId }])
      .mockResolvedValueOnce([{ id: assetId, storage_key: 'gallery/published-photo.preview.webp' }]);

    const response = await getAssetUrl(
      request(`/api/gallery/assets/published-photo/url?token=${galleryToken}&preview=1`),
      { params: { assetKey: 'published-photo' } },
    );

    expect(response.status).toBe(200);
    expect(mocks.issueSignedToken).toHaveBeenCalledWith(expect.objectContaining({
      pathname: 'gallery/published-photo.preview.webp',
      operations: ['get'],
    }));
    expect(mocks.presignUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pathname: 'gallery/published-photo.preview.webp', useCache: true }),
    );
    const assetQuery = mocks.sql.mock.calls[1] as unknown[];
    expect((assetQuery[0] as TemplateStringsArray).join('')).toContain('COALESCE(thumbnail_key, storage_key)');
    expect(assetQuery).toContain(true);
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });

  it('keeps an issued download URL available when activity logging fails', async () => {
    mocks.sql
      .mockResolvedValueOnce([{ household_id: householdId }])
      .mockResolvedValueOnce([{ id: assetId, storage_key: 'gallery/published-photo.jpg' }])
      .mockRejectedValueOnce(new Error('activity database unavailable'));
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

    expect(response.status).toBe(200);
    expect((await response.json()).url).toContain('.private.blob.vercel-storage.com/');
  });
  it('waits for Gallery-open activity logging before responding', async () => {
    const activity = deferred<void>();
    let insertStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      insertStarted = resolve;
    });
    mocks.sql
      .mockResolvedValueOnce([{ household_id: householdId }])
      .mockResolvedValueOnce([])
      .mockImplementationOnce(() => {
        insertStarted();
        return activity.promise;
      });

    const responsePromise = listGallery(
      request(`/api/gallery?token=${galleryToken}`, {
        'x-gallery-session': '123e4567-e89b-42d3-a456-426614174000',
      }),
    );
    await started;
    let responseFinished = false;
    void responsePromise.then(() => {
      responseFinished = true;
    });
    await Promise.resolve();

    expect(responseFinished).toBe(false);
    activity.resolve(undefined);
    expect((await responsePromise).status).toBe(200);
  });

  it('waits for download activity logging before responding', async () => {
    const activity = deferred<void>();
    let insertStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      insertStarted = resolve;
    });
    mocks.sql
      .mockResolvedValueOnce([{ household_id: householdId }])
      .mockResolvedValueOnce([{ id: assetId, storage_key: 'gallery/published-photo.jpg' }])
      .mockImplementationOnce(() => {
        insertStarted();
        return activity.promise;
      });
    mocks.issueSignedToken.mockResolvedValue({
      delegationToken: 'delegation',
      clientSigningToken: 'signing',
      validUntil: Date.now() + 300_000,
    });
    mocks.presignUrl.mockResolvedValue({
      presignedUrl: 'https://store.private.blob.vercel-storage.com/gallery/published-photo.jpg?signature=1',
    });

    const responsePromise = getAssetUrl(
      request(`/api/gallery/assets/published-photo/url?token=${galleryToken}&download=1`),
      { params: { assetKey: 'published-photo' } },
    );
    await started;
    let responseFinished = false;
    void responsePromise.then(() => {
      responseFinished = true;
    });
    await Promise.resolve();

    expect(responseFinished).toBe(false);
    activity.resolve(undefined);
    expect((await responsePromise).status).toBe(200);
  });

  it('paginates published assets and records only the first open in a tab session', async () => {
    const tabSessionId = '123e4567-e89b-12d3-a456-426614174000';
    const pagedAssets = Array.from({ length: 49 }, (_, index) => ({
      public_key: `published-photo-${index}`,
      media_type: 'photo',
      photo_source: 'guest',
      content_type: 'image/jpeg',
      size_bytes: '2048',
      storage_key: `gallery/published-photo-${index}.jpg`,
      thumbnail_key: `gallery/published-photo-${index}.preview.webp`,
      display_name: `Published photo ${index}.jpg`,
      position: String(index + 1),
      created_at: new Date(Date.parse('2026-09-19T12:00:00.000Z') + index * 60_000).toISOString(),
      moderation_status: 'published',
    }));
    mocks.sql
      .mockResolvedValueOnce([{ household_id: householdId }])
      .mockResolvedValueOnce(pagedAssets);

    const firstResponse = await listGallery(
      request(`/api/gallery?token=${galleryToken}`, { 'x-gallery-session': tabSessionId }),
    );
    const firstBody = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstBody.assets).toHaveLength(48);
    expect(mocks.issueSignedToken).toHaveBeenCalledTimes(48);
    expect(mocks.presignUrl).toHaveBeenCalledTimes(48);
    expect(mocks.issueSignedToken).toHaveBeenCalledWith(expect.objectContaining({
      pathname: 'gallery/published-photo-0.preview.webp',
    }));
    expect(mocks.presignUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ useCache: true }),
    );
    expect(firstBody.next_cursor).toEqual(expect.any(String));
    expect(JSON.parse(Buffer.from(firstBody.next_cursor, 'base64url').toString('utf8'))).toEqual({
      position: pagedAssets[47].position,
      photoSource: 'guest',
      source: 'all',
    });
    expect(mocks.sql).toHaveBeenCalledTimes(3);
    const openCall = mocks.sql.mock.calls[2] as unknown[];
    const openQuery = (openCall[0] as TemplateStringsArray).join('');
    expect(openQuery).toContain("'gallery_open'");
    expect(openQuery).toContain('ON CONFLICT DO NOTHING');
    expect(openCall.slice(1)).toEqual([householdId, tabSessionId]);

    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.sql
      .mockResolvedValueOnce([{ household_id: householdId }])
      .mockResolvedValueOnce(pagedAssets.slice(48));

    const secondResponse = await listGallery(
      request(`/api/gallery?token=${galleryToken}&cursor=${firstBody.next_cursor}`, {
        'x-gallery-session': tabSessionId,
      }),
    );
    const secondBody = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondBody.assets).toHaveLength(1);
    expect(secondBody.assets[0].asset_key).toBe('published-photo-48');
    expect(secondBody.next_cursor).toBeNull();
    expect(mocks.sql.mock.calls[1]).toContain(pagedAssets[47].position);
    expect(mocks.sql.mock.calls[1]).toContain(1);
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });
  it('filters gallery pages by source and rejects cursors from another source', async () => {
    const professionalAssets = Array.from({ length: 49 }, (_, index) => ({
      public_key: `professional-photo-${index}`,
      media_type: 'photo',
      photo_source: 'professional',
      content_type: 'image/jpeg',
      size_bytes: '2048',
      storage_key: `gallery/professional-photo-${index}.jpg`,
      thumbnail_key: `gallery/professional-photo-${index}.preview.webp`,
      display_name: `Professional photo ${index}.jpg`,
      position: String(index + 1),
      created_at: new Date(Date.parse('2026-09-19T12:00:00.000Z') + index * 60_000).toISOString(),
      moderation_status: 'published',
    }));
    mocks.sql
      .mockResolvedValueOnce([{ household_id: householdId }])
      .mockResolvedValueOnce(professionalAssets);

    const response = await listGallery(request(`/api/gallery?token=${galleryToken}&source=professional`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets).toHaveLength(48);
    expect(body.assets[0].photo_source).toBe('professional');
    expect(mocks.sql.mock.calls[1]).toContain('professional');
    expect(JSON.parse(Buffer.from(body.next_cursor, 'base64url').toString('utf8'))).toEqual({
      position: professionalAssets[47].position,
      photoSource: 'professional',
      source: 'professional',
    });

    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.sql.mockResolvedValueOnce([{ household_id: householdId }]);
    const mismatchedCursor = await listGallery(
      request(`/api/gallery?token=${galleryToken}&source=guest&cursor=${body.next_cursor}`),
    );

    expect(mismatchedCursor.status).toBe(400);
    expect(await mismatchedCursor.json()).toEqual({ error: 'Invalid gallery cursor' });
    expect(mocks.sql).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.sql.mockResolvedValueOnce([{ household_id: householdId }]);
    const invalidSource = await listGallery(request(`/api/gallery?token=${galleryToken}&source=amateur`));

    expect(invalidSource.status).toBe(400);
    expect(await invalidSource.json()).toEqual({ error: 'Invalid gallery source' });
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });


  it('does not issue a URL for a pending asset or missing asset', async () => {
    mocks.sql
      .mockResolvedValueOnce([{ household_id: householdId }])
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
