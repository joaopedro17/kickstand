import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AuthError, startLoginFlow } from '@/lib/auth/login';
import { authTokensStorage } from '@/lib/auth/storage';
import { refreshResponse } from '@/tests/support/tokens';

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

  it('throws "exchange_failed" when the proxy answers 200 without usable tokens', async () => {
    kickRedirectsWith((state) => `?code=abc123&state=${state}`);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'a' }) })
    );

    const error = await startLoginFlow().catch((e) => e);

    expect((error as AuthError).code).toBe('exchange_failed');
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
