import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  isTokenExpiringSoon,
  refreshTokens,
  getValidAccessToken,
  withAuthRetry,
  logout,
  startLoginFlow,
  AuthError,
} from './auth';
import { authTokensStorage, type AuthTokens } from './storage';
import { KickApiError } from './kick-api';

function tokens(overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + 60 * 60 * 1000,
    refreshExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

describe('isTokenExpiringSoon', () => {
  it('is false when far from expiry', () => {
    expect(isTokenExpiringSoon(tokens())).toBe(false);
  });

  it('is true when within the buffer window', () => {
    expect(
      isTokenExpiringSoon(tokens({ expiresAt: Date.now() + 30 * 1000 }))
    ).toBe(true);
  });

  it('is false with three minutes left, outside the two-minute buffer', () => {
    expect(isTokenExpiringSoon(tokens({ expiresAt: Date.now() + 3 * 60 * 1000 }))).toBe(false);
  });

  it('is true with ninety seconds left, inside the two-minute buffer', () => {
    expect(isTokenExpiringSoon(tokens({ expiresAt: Date.now() + 90 * 1000 }))).toBe(true);
  });

  it('is true when already expired', () => {
    expect(
      isTokenExpiringSoon(tokens({ expiresAt: Date.now() - 1000 }))
    ).toBe(true);
  });
});

function refreshResponse(accessToken: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: `refresh-for-${accessToken}`,
      refresh_expires_in: 86400,
      scope: 'user:read',
    }),
  };
}

describe('refreshTokens', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores and returns refreshed tokens on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refreshResponse('access-2')));

    const result = await refreshTokens(tokens());

    expect(result).toEqual({ ok: true, tokens: expect.objectContaining({ accessToken: 'access-2' }) });
    expect((await authTokensStorage.getValue())?.accessToken).toBe('access-2');
  });

  it.each([400, 401, 403])('reports a %i from the token proxy as rejected', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));

    expect(await refreshTokens(tokens())).toEqual({ ok: false, reason: 'rejected' });
  });

  it.each([429, 500, 502, 503])('reports a %i from the token proxy as transient', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));

    expect(await refreshTokens(tokens())).toEqual({ ok: false, reason: 'transient' });
  });

  it('reports a network failure as transient', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    expect(await refreshTokens(tokens())).toEqual({ ok: false, reason: 'transient' });
  });

  it('reports an expired refresh token as rejected without contacting the proxy', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshTokens(tokens({ refreshExpiresAt: Date.now() - 1 }));

    expect(result).toEqual({ ok: false, reason: 'rejected' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getValidAccessToken', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when logged out', async () => {
    expect(await getValidAccessToken()).toBeNull();
  });

  it('returns the current token when not expiring soon', async () => {
    await authTokensStorage.setValue(tokens());
    expect(await getValidAccessToken()).toBe('access-1');
  });

  it('refreshes and returns the new token when expiring soon', async () => {
    await authTokensStorage.setValue(tokens({ expiresAt: Date.now() + 1000 }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'access-refreshed',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'refresh-refreshed',
          refresh_expires_in: 86400,
          scope: 'user:read',
        }),
      })
    );
    expect(await getValidAccessToken()).toBe('access-refreshed');
  });

  it('clears tokens and returns null when refresh fails', async () => {
    await authTokensStorage.setValue(tokens({ expiresAt: Date.now() + 1000 }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await getValidAccessToken()).toBeNull();
    expect(await authTokensStorage.getValue()).toBeNull();
  });

  it('keeps the user logged in and uses the current token when a refresh fails transiently before expiry', async () => {
    await authTokensStorage.setValue(tokens({ expiresAt: Date.now() + 1000 }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    expect(await getValidAccessToken()).toBe('access-1');
    expect(await authTokensStorage.getValue()).not.toBeNull();
  });

  it('keeps the user logged in but reports a network error when the token has expired and the refresh fails transiently', async () => {
    await authTokensStorage.setValue(tokens({ expiresAt: Date.now() - 1000 }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const error = await getValidAccessToken().catch((e) => e);

    expect(error).toBeInstanceOf(KickApiError);
    expect((error as KickApiError).kind).toBe('network');
    expect(await authTokensStorage.getValue()).not.toBeNull();
  });

  it('shares a single in-flight refresh across concurrent calls', async () => {
    await authTokensStorage.setValue(tokens({ expiresAt: Date.now() + 1000 }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access-concurrent',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh-concurrent',
        refresh_expires_in: 86400,
        scope: 'user:read',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const [first, second, third] = await Promise.all([
      getValidAccessToken(),
      getValidAccessToken(),
      getValidAccessToken(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toBe('access-concurrent');
    expect(second).toBe('access-concurrent');
    expect(third).toBe('access-concurrent');
  });
});

describe('withAuthRetry', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockRefreshSuccess(accessToken: string) {
    return vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: `refresh-for-${accessToken}`,
        refresh_expires_in: 86400,
        scope: 'user:read',
      }),
    });
  }

  it('returns null immediately when logged out, without calling fn', async () => {
    const fn = vi.fn();
    expect(await withAuthRetry(fn)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('retries once after a 401 and succeeds with the refreshed token', async () => {
    await authTokensStorage.setValue(tokens());
    vi.stubGlobal('fetch', mockRefreshSuccess('access-retried'));

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new KickApiError('unauthorized', 'Access token rejected', 401))
      .mockResolvedValueOnce('ok-result');

    const result = await withAuthRetry(fn);

    expect(result).toBe('ok-result');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'access-1');
    expect(fn).toHaveBeenNthCalledWith(2, 'access-retried');
    expect((await authTokensStorage.getValue())?.accessToken).toBe('access-retried');
  });

  it('clears auth state and returns null when the 401 persists after refresh', async () => {
    await authTokensStorage.setValue(tokens());
    vi.stubGlobal('fetch', mockRefreshSuccess('access-still-bad'));

    const fn = vi
      .fn()
      .mockRejectedValue(new KickApiError('unauthorized', 'Access token rejected', 401));

    const result = await withAuthRetry(fn);

    expect(result).toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(await authTokensStorage.getValue()).toBeNull();
  });

  it('clears auth state and returns null when the forced refresh itself fails', async () => {
    await authTokensStorage.setValue(tokens());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const fn = vi
      .fn()
      .mockRejectedValue(new KickApiError('unauthorized', 'Access token rejected', 401));

    const result = await withAuthRetry(fn);

    expect(result).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(await authTokensStorage.getValue()).toBeNull();
  });

  it('keeps the user logged in and reports a network error when the forced refresh fails transiently', async () => {
    await authTokensStorage.setValue(tokens());
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const fn = vi
      .fn()
      .mockRejectedValue(new KickApiError('unauthorized', 'Access token rejected', 401));

    const error = await withAuthRetry(fn).catch((e) => e);

    expect(error).toBeInstanceOf(KickApiError);
    expect((error as KickApiError).kind).toBe('network');
    expect(await authTokensStorage.getValue()).not.toBeNull();
  });

  it('propagates non-unauthorized errors without retrying', async () => {
    await authTokensStorage.setValue(tokens());
    const fn = vi.fn().mockRejectedValue(new KickApiError('network', 'Network request failed'));

    await expect(withAuthRetry(fn)).rejects.toThrow('Network request failed');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('logout', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('clears stored tokens', async () => {
    await authTokensStorage.setValue(tokens());
    await logout();
    expect(await authTokensStorage.getValue()).toBeNull();
  });
});

describe('startLoginFlow', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    
    // fakeBrowser doesn't implement browser.identity.getRedirectURL either
    // (it throws "not implemented" like launchWebAuthFlow), so every test
    // in this block needs it stubbed regardless of which OAuth outcome
    // it's exercising.
    vi.spyOn(browser.identity, 'getRedirectURL').mockReturnValue(
      'https://extension-id.chromiumapp.org/'
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws AuthError with code "cancelled" when the auth flow returns no URL', async () => {
    vi.spyOn(browser.identity, 'launchWebAuthFlow').mockImplementation(async () => undefined);

    const error = await startLoginFlow().catch((e) => e);

    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).code).toBe('cancelled');
  });

  it('throws AuthError with code "state_mismatch" when the returned state does not match', async () => {
    vi.spyOn(browser.identity, 'launchWebAuthFlow').mockImplementation(
      async () => 'https://example.com/?code=abc123&state=wrong-state'
    );

    const error = await startLoginFlow().catch((e) => e);

    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).code).toBe('state_mismatch');
  });

  it('throws AuthError with code "oauth_rejected" when Kick returns an OAuth error', async () => {
    vi.spyOn(browser.identity, 'launchWebAuthFlow').mockImplementation(
      async () => 'https://example.com/?error=access_denied&error_description=User+declined'
    );

    const error = await startLoginFlow().catch((e) => e);

    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).code).toBe('oauth_rejected');
    expect((error as AuthError).detail).toBe('User declined');
  });

  // Answers the OAuth window with whatever query `respond` builds from the
  // state Kickstand sent, the way Kick's redirect would.
  function kickRedirectsWith(respond: (state: string) => string) {
    vi.spyOn(browser.identity, 'launchWebAuthFlow').mockImplementation(async ({ url }) => {
      const state = new URL(url).searchParams.get('state') ?? '';
      return `https://extension-id.chromiumapp.org/${respond(state)}`;
    });
  }

  it('exchanges the code through the token proxy and stores the session', async () => {
    kickRedirectsWith((state) => `?code=abc123&state=${state}`);
    const fetchMock = vi.fn().mockResolvedValue(refreshResponse('access-login'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await startLoginFlow();

    expect(result.accessToken).toBe('access-login');
    expect((await authTokensStorage.getValue())?.accessToken).toBe('access-login');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/token$/);
    expect(JSON.parse(init.body)).toMatchObject({
      code: 'abc123',
      redirect_uri: 'https://extension-id.chromiumapp.org/',
    });
    vi.unstubAllGlobals();
  });

  it('throws "exchange_failed" with the status, and stores nothing, when the proxy refuses the code', async () => {
    kickRedirectsWith((state) => `?code=abc123&state=${state}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));

    const error = await startLoginFlow().catch((e) => e);

    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).code).toBe('exchange_failed');
    expect((error as AuthError).detail).toBe('502');
    expect(await authTokensStorage.getValue()).toBeNull();
    vi.unstubAllGlobals();
  });

  it('throws "no_code" carrying the query Kick sent back', async () => {
    kickRedirectsWith((state) => `?state=${state}`);

    const error = await startLoginFlow().catch((e) => e);

    expect((error as AuthError).code).toBe('no_code');
    expect((error as AuthError).detail).toMatch(/^\?state=/);
  });

  it('throws "no_code" saying the query was empty when Kick sent none', async () => {
    kickRedirectsWith(() => '');

    const error = await startLoginFlow().catch((e) => e);

    expect((error as AuthError).code).toBe('no_code');
    expect((error as AuthError).detail).toBe('empty query string');
  });

  it('reports the OAuth error code alone when Kick gives no description', async () => {
    kickRedirectsWith(() => '?error=server_error');

    const error = await startLoginFlow().catch((e) => e);

    expect((error as AuthError).code).toBe('oauth_rejected');
    expect((error as AuthError).detail).toBe('server_error');
  });
});
