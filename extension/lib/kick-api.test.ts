import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  chunk,
  KickApiError,
  resolveChannelsBySlug,
  fetchLivestreamsForUsers,
  fetchLivestreams,
  fetchCategories,
} from './kick-api';

describe('chunk', () => {
  it('splits an array into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when smaller than the size', () => {
    expect(chunk([1, 2], 100)).toEqual([[1, 2]]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], 10)).toEqual([]);
  });
});

describe('kick-api requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolveChannelsBySlug batches slugs into groups of 50 and merges results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ broadcaster_user_id: 1, slug: 'a' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const slugs = Array.from({ length: 60 }, (_, i) => `slug-${i}`);
    const result = await resolveChannelsBySlug(slugs, 'token');

    expect(fetchMock).toHaveBeenCalledTimes(2); // 60 slugs -> batches of 50 + 10
    expect(result).toHaveLength(2);
  });

  it('fetchLivestreamsForUsers batches ids into groups of 100', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ids = Array.from({ length: 150 }, (_, i) => i);
    await fetchLivestreamsForUsers(ids, 'token');

    expect(fetchMock).toHaveBeenCalledTimes(2); // 150 ids -> batches of 100 + 50
  });

  it('fetchLivestreams passes category/cursor/limit as query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], pagination: { next_cursor: null } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchLivestreams({ categoryId: [10, 20], cursor: 'abc', limit: 50 }, 'token');

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/public/v2/livestreams');
    expect(calledUrl.searchParams.getAll('category_id')).toEqual(['10', '20']);
    expect(calledUrl.searchParams.get('cursor')).toBe('abc');
    expect(calledUrl.searchParams.get('limit')).toBe('50');
  });

  it('fetchCategories hits /public/v2/categories', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], pagination: { next_cursor: null } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchCategories({ limit: 25 }, 'token');

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/public/v2/categories');
  });

  it('throws KickApiError with kind "unauthorized" on a 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    );
    await expect(fetchLivestreamsForUsers([1], 'token')).rejects.toMatchObject({
      kind: 'unauthorized',
      status: 401,
    });
  });

  it('throws KickApiError with kind "rate-limited" on a 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    );
    await expect(fetchLivestreamsForUsers([1], 'token')).rejects.toMatchObject({
      kind: 'rate-limited',
    });
  });

  it('throws KickApiError with kind "network" when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchLivestreamsForUsers([1], 'token')).rejects.toMatchObject({
      kind: 'network',
    });
  });
});
