import { KICK_REVOKE_URL } from '@/lib/config';
import { fetchWithTimeout } from '@/lib/fetch-timeout';
import { authTokensStorage } from './storage';

/** A revoke Kick hasn't answered after this long is given up on; the local logout already happened. */
export const REVOKE_TIMEOUT_MS = 5_000;

/** Asks Kick to invalidate `token`. Best-effort: a failure changes nothing for the user. */
async function revoke(token: string, hint: 'access_token' | 'refresh_token'): Promise<void> {
  // Kick's docs list these as query parameters while declaring a form body,
  // so they go in both.
  const params = new URLSearchParams({ token, token_hint_type: hint });
  try {
    await fetchWithTimeout(
      `${KICK_REVOKE_URL}?${params}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      },
      REVOKE_TIMEOUT_MS
    );
  } catch {
    // Offline or Kick down: the tokens expire on their own.
  }
}

/**
 * Ends the session here first, so nothing can block it, then asks Kick to
 * revoke both tokens. Kick doesn't document whether revoking one revokes
 * the other; the refresh token goes first, since it is the one that can
 * mint new access tokens.
 */
export async function logout(): Promise<void> {
  const tokens = await authTokensStorage.getValue();
  await authTokensStorage.setValue(null);
  if (!tokens) return;
  await revoke(tokens.refreshToken, 'refresh_token');
  await revoke(tokens.accessToken, 'access_token');
}
