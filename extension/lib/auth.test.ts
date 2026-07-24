import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  isTokenExpiringSoon,
  refreshTokens,
  getValidAccessToken,
  logout,
} from './auth';
import { authTokensStorage, type AuthTokens } from './storage';

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

  it('is true when already expired', () => {
    expect(
      isTokenExpiringSoon(tokens({ expiresAt: Date.now() - 1000 }))
    ).toBe(true);
  });
});

describe('refreshTokens', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores and returns refreshed tokens on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'access-2',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'refresh-2',
          refresh_expires_in: 86400,
          scope: 'user:read',
        }),
      })
    );

    const result = await refreshTokens(tokens());
    expect(result?.accessToken).toBe('access-2');
    expect((await authTokensStorage.getValue())?.accessToken).toBe('access-2');
  });

  it('returns null on a failed refresh', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const result = await refreshTokens(tokens());
    expect(result).toBeNull();
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
