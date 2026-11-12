import { parseTokenResponse } from '@/lib/kick/parse';
import type { TokenGrant } from '@/lib/kick/types';
import type { AuthTokens } from './storage';

/** A grant from Kick, with its lifetimes turned into expiry times. */
export function toAuthTokens(grant: TokenGrant): AuthTokens {
  const now = Date.now();
  return {
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    expiresAt: now + grant.expiresInSeconds * 1000,
    refreshExpiresAt: now + grant.refreshExpiresInSeconds * 1000,
  };
}

/** The token proxy's answer as a grant, or null when it isn't a usable one. */
export async function readGrant(res: Response): Promise<TokenGrant | null> {
  try {
    return parseTokenResponse(await res.json());
  } catch {
    return null;
  }
}
