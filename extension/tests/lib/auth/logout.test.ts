import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { logout, REVOKE_TIMEOUT_MS } from '@/lib/auth/logout';
import { authTokensStorage } from '@/lib/auth/storage';
import { tokens } from '@/tests/support/tokens';

describe('logout', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const revoked = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.map(([url]) => {
      const u = new URL(url as string);
      return [u.origin + u.pathname, u.searchParams.get('token'), u.searchParams.get('token_hint_type')];
    });

  it('clears stored tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await authTokensStorage.setValue(tokens());

    await logout();

    expect(await authTokensStorage.getValue()).toBeNull();
  });

  it('asks Kick to revoke the refresh token, then the access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    await authTokensStorage.setValue(tokens());

    await logout();

    expect(revoked(fetchMock)).toEqual([
      ['https://id.kick.com/oauth/revoke', 'refresh-1', 'refresh_token'],
      ['https://id.kick.com/oauth/revoke', 'access-1', 'access_token'],
    ]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('logs out locally even when Kick cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await authTokensStorage.setValue(tokens());

    await expect(logout()).resolves.toBeUndefined();
    expect(await authTokensStorage.getValue()).toBeNull();
  });

  it('clears the tokens before waiting on Kick, and gives up on a revoke that hangs', async () => {
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
    await authTokensStorage.setValue(tokens());

    const done = logout();
    await vi.advanceTimersByTimeAsync(0);
    expect(await authTokensStorage.getValue()).toBeNull();
    await vi.advanceTimersByTimeAsync(REVOKE_TIMEOUT_MS * 2);
    await expect(done).resolves.toBeUndefined();
  });

  it('does nothing over the network when already logged out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await logout();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
