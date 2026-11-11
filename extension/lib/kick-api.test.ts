import { describe, it, expect, vi, afterEach } from 'vitest';
import { REQUEST_TIMEOUT_MS, retryAfterMs } from './kick-api';
import {
  chunk,
  resolveChannelsBySlug,
  fetchLivestreamsForUsers,
  fetchLivestreams,
  fetchCategoryPage,
  searchCategories,
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

  it('fetchLivestreamsForUsers asks for every given user in one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    // Splitting into requests is the caller's job (see MAX_USERS_PER_LIVESTREAM_REQUEST),
    // so that one failed request only costs the caller that batch.
    const ids = Array.from({ length: 150 }, (_, i) => i);
    await fetchLivestreamsForUsers(ids, 'token');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/public/v1/users/livestreams');
    expect(calledUrl.searchParams.getAll('user_id')).toHaveLength(150);
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

  it('fetchCategoryPage asks for 25 categories from the given cursor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], pagination: { next_cursor: 'n' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchCategoryPage('c1', 'token')).toEqual({ items: [], nextCursor: 'n' });

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/public/v2/categories');
    expect(calledUrl.searchParams.get('cursor')).toBe('c1');
    expect(calledUrl.searchParams.get('limit')).toBe('25');
  });

  it('searchCategories asks Kick by name and returns the matches', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 1, name: 'Slots' }], pagination: { next_cursor: 'x' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await searchCategories('slo', 'token')).toEqual([
      { id: 1, name: 'Slots', thumbnail: null, tags: [] },
    ]);

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.getAll('name')).toEqual(['slo']);
    expect(calledUrl.searchParams.has('cursor')).toBe(false);
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

  it('turns a reply that is not JSON into an "other" error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      })
    );

    await expect(fetchLivestreamsForUsers([1], 'token')).rejects.toMatchObject({ kind: 'other' });
  });

  it('turns a reply of the wrong shape into an "other" error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: 'hi' }) })
    );

    await expect(fetchLivestreamsForUsers([1], 'token')).rejects.toMatchObject({ kind: 'other' });
  });

  it('gives up on a request Kick never answers, as a network error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          )
      )
    );

    const request = fetchLivestreamsForUsers([1], 'token');
    const outcome = expect(request).rejects.toMatchObject({ kind: 'network' });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await outcome;
    vi.useRealTimers();
  });

  it('tells the caller how long Kick asked it to wait after a 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '120' }),
      })
    );

    await expect(fetchLivestreamsForUsers([1], 'token')).rejects.toMatchObject({
      kind: 'rate-limited',
      retryAfterMs: 120_000,
    });
  });
});

describe('retryAfterMs', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');

  it('reads a number of seconds', () => {
    expect(retryAfterMs('30', now)).toBe(30_000);
  });

  it('reads an HTTP date', () => {
    expect(retryAfterMs('Wed, 11 Nov 2026 12:01:00 GMT', now)).toBe(60_000);
  });

  it.each([null, '', 'soon', '-5'])('ignores %j', (value) => {
    expect(retryAfterMs(value, now)).toBeNull();
  });

  it('never returns a wait in the past', () => {
    expect(retryAfterMs('Wed, 11 Nov 2026 11:00:00 GMT', now)).toBe(0);
  });
});
