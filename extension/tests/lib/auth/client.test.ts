import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeBackground } from '@/tests/support/fake-background';
import { withAuthRetry, requestLogout } from '@/lib/auth/client';
import { KickApiError } from '@/lib/kick/api';
import { authTokensStorage } from '@/lib/auth/storage';

const rejected = () => new KickApiError('unauthorized', 'Access token rejected', 401);

describe('popup withAuthRetry', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs fn with the access token the background hands out', async () => {
    fakeBackground({ 'get-access-token': async () => ({ status: 'ok', accessToken: 'bg-token' }) });
    const fn = vi.fn().mockResolvedValue('result');

    expect(await withAuthRetry(fn)).toBe('result');
    expect(fn).toHaveBeenCalledWith('bg-token');
  });

  it('never writes the stored tokens itself', async () => {
    await authTokensStorage.setValue(null);
    const { received } = fakeBackground({
      'get-access-token': async () => ({ status: 'ok', accessToken: 'bg-token' }),
    });

    await withAuthRetry(vi.fn().mockRejectedValueOnce(rejected()).mockResolvedValue('ok'));

    expect(await authTokensStorage.getValue()).toBeNull();
    expect(received.map((r) => r.type)).toEqual(['get-access-token', 'get-access-token']);
  });

  it('returns null without calling fn when the background says there is no session', async () => {
    fakeBackground({ 'get-access-token': async () => ({ status: 'logged-out' }) });
    const fn = vi.fn();

    expect(await withAuthRetry(fn)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('throws a network error, keeping the session, when the background cannot get a token right now', async () => {
    const { received } = fakeBackground({
      'get-access-token': async () => ({ status: 'unavailable' }),
    });
    const fn = vi.fn();

    const error = await withAuthRetry(fn).catch((e) => e);

    expect(error).toBeInstanceOf(KickApiError);
    expect((error as KickApiError).kind).toBe('network');
    expect(fn).not.toHaveBeenCalled();
    expect(received.some((r) => r.type === 'logout')).toBe(false);
  });

  it('after a 401, asks the background again naming the rejected token, and retries with the new one', async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', accessToken: 'old' })
      .mockResolvedValueOnce({ status: 'ok', accessToken: 'new' });
    const { received } = fakeBackground({ 'get-access-token': handler });
    const fn = vi.fn().mockRejectedValueOnce(rejected()).mockResolvedValueOnce('second try');

    expect(await withAuthRetry(fn)).toBe('second try');
    expect(fn).toHaveBeenNthCalledWith(2, 'new');
    expect(received[1]).toEqual({ type: 'get-access-token', rejectedToken: 'old' });
  });

  it('asks the background to log out and returns null when the new token is rejected too', async () => {
    const { received } = fakeBackground();
    const fn = vi.fn().mockRejectedValue(rejected());

    expect(await withAuthRetry(fn)).toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(received.at(-1)).toEqual({ type: 'logout' });
  });

  it('returns null when the background ends the session instead of handing out a new token', async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', accessToken: 'old' })
      .mockResolvedValueOnce({ status: 'logged-out' });
    fakeBackground({ 'get-access-token': handler });
    const fn = vi.fn().mockRejectedValue(rejected());

    expect(await withAuthRetry(fn)).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes other errors through without retrying', async () => {
    fakeBackground();
    const fn = vi.fn().mockRejectedValue(new KickApiError('rate-limited', 'Rate limited', 429));

    await expect(withAuthRetry(fn)).rejects.toThrow('Rate limited');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes a non-401 failure of the retry through', async () => {
    fakeBackground();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rejected())
      .mockRejectedValueOnce(new KickApiError('network', 'Network request failed'));

    await expect(withAuthRetry(fn)).rejects.toThrow('Network request failed');
  });
});

describe('requestLogout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the background to end the session', async () => {
    const { received } = fakeBackground();

    await requestLogout();

    expect(received).toEqual([{ type: 'logout' }]);
  });
});
