import { storage } from 'wxt/utils/storage';

// What Kickstand keeps about the logged-in account. Only the background
// writes the tokens (see lib/auth/session.ts); the popup only reads them.

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
}

export const authTokensStorage = storage.defineItem<AuthTokens | null>(
  'local:authTokens',
  { fallback: null }
);

/** The logged-in user's Kick profile picture, remembered so the popup can show it without asking Kick each time. */
export interface CachedProfile {
  avatarUrl: string | null;
  fetchedAt: number;
}

export const profileStorage = storage.defineItem<CachedProfile | null>('local:profile', {
  fallback: null,
});
