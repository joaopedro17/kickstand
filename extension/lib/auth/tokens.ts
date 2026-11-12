import { WORKER_BASE_URL } from '@/lib/config';
import { KickApiError } from '@/lib/kick/error';
import type { TokenReply } from '@/lib/messages';
import { readGrant, toAuthTokens } from './grant';
import { logout } from './logout';
import { retryOnUnauthorized, type TokenSource } from './retry';
import { authTokensStorage, type AuthTokens } from './storage';

// The background's side of the session: keeps the access token fresh and
// hands it out. Nothing else writes the stored tokens after login.

/** Refresh this long before the access token actually expires. */
const REFRESH_BUFFER_MS = 2 * 60 * 1000;

export function isTokenExpiringSoon(tokens: AuthTokens): boolean {
  return Date.now() >= tokens.expiresAt - REFRESH_BUFFER_MS;
}

export type RefreshResult =
  | { ok: true; tokens: AuthTokens }
  | { ok: false; reason: 'rejected' | 'transient' };

// Only these mean Kick refused the refresh token itself. Anything else
// (offline, rate-limited, Kick or the proxy down) says nothing about the
// token, so it must not log the user out.
const REJECTED_STATUSES = new Set([400, 401, 403]);

export async function refreshTokens(tokens: AuthTokens): Promise<RefreshResult> {
  if (Date.now() >= tokens.refreshExpiresAt) return { ok: false, reason: 'rejected' };

  let res: Response;
  try {
    res = await fetch(`${WORKER_BASE_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    });
  } catch {
    return { ok: false, reason: 'transient' };
  }
  if (!res.ok) {
    return { ok: false, reason: REJECTED_STATUSES.has(res.status) ? 'rejected' : 'transient' };
  }
  // A 200 without usable tokens says nothing about the refresh token itself,
  // so it must not end the session.
  const grant = await readGrant(res);
  if (!grant) return { ok: false, reason: 'transient' };
  const refreshed = toAuthTokens(grant);
  await authTokensStorage.setValue(refreshed);
  return { ok: true, tokens: refreshed };
}

// Single-flight guard: when multiple callers in this context need a refresh
// at roughly the same time, they share one in-flight `refreshTokens()` call
// instead of each redeeming Kick's rotating refresh token (the second
// redemption of an already-rotated token would be rejected).
let inFlightRefresh: Promise<RefreshResult> | null = null;

function refreshTokensSingleFlight(tokens: AuthTokens): Promise<RefreshResult> {
  if (!inFlightRefresh) {
    inFlightRefresh = refreshTokens(tokens).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

class TransientRefreshFailure extends KickApiError {
  constructor() {
    super('network', 'Could not refresh the session right now');
  }
}

/**
 * Turns a refresh outcome into a usable access token, or null when the
 * session is over. `fallback` is a token still worth trying when the
 * refresh failed for a reason unrelated to the session itself.
 */
async function resolveRefresh(
  result: RefreshResult,
  fallback: string | null
): Promise<string | null> {
  if (result.ok) return result.tokens.accessToken;
  if (result.reason === 'rejected') {
    await authTokensStorage.setValue(null);
    return null;
  }
  if (fallback) return fallback;
  throw new TransientRefreshFailure();
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await authTokensStorage.getValue();
  if (!tokens) return null;
  if (!isTokenExpiringSoon(tokens)) return tokens.accessToken;

  const stillValid = Date.now() < tokens.expiresAt ? tokens.accessToken : null;
  return resolveRefresh(await refreshTokensSingleFlight(tokens), stillValid);
}

/**
 * A replacement for an access token Kick just rejected. If the stored token
 * is no longer the rejected one, another caller already refreshed, so the
 * stored token is handed out without spending the refresh token again.
 */
export async function tokenAfterRejection(rejectedToken: string): Promise<string | null> {
  const tokens = await authTokensStorage.getValue();
  if (!tokens) return null;
  if (tokens.accessToken !== rejectedToken) return tokens.accessToken;
  return resolveRefresh(await refreshTokensSingleFlight(tokens), null);
}

/** The background's tokens: read and written here and nowhere else. */
const backgroundTokens: TokenSource = {
  current: getValidAccessToken,
  afterRejection: tokenAfterRejection,
  endSession: () => logout(),
};

/** `retryOnUnauthorized` for code running in the background. */
export function withAuthRetry<T>(fn: (accessToken: string) => Promise<T>): Promise<T | null> {
  return retryOnUnauthorized(backgroundTokens, fn);
}

async function tokenFor(request: { rejectedToken?: string }): Promise<string | null> {
  return request.rejectedToken
    ? tokenAfterRejection(request.rejectedToken)
    : getValidAccessToken();
}

/** Answers a popup's request for an access token. */
export async function answerTokenRequest(request: {
  type: 'get-access-token';
  rejectedToken?: string;
}): Promise<TokenReply> {
  try {
    const accessToken = await tokenFor(request);
    return accessToken ? { status: 'ok', accessToken } : { status: 'logged-out' };
  } catch (err) {
    if (err instanceof TransientRefreshFailure) return { status: 'unavailable' };
    throw err;
  }
}
