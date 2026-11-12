import type { AuthTokens } from '@/lib/auth/storage';

/** Tokens that are valid for an hour, refreshable for a day. */
export function tokens(overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + 60 * 60 * 1000,
    refreshExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

/** The token proxy's answer to a successful refresh. */
export function refreshResponse(accessToken: string) {
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
