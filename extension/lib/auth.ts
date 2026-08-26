import {
  KICK_AUTHORIZE_URL,
  KICK_CLIENT_ID,
  KICK_SCOPES,
  WORKER_BASE_URL,
} from './config';
import { authTokensStorage, type AuthTokens } from './storage';
import type { TokenResponse } from './types';
import { KickApiError } from './kick-api';

export type AuthErrorCode =
  | 'cancelled'
  | 'oauth_rejected'
  | 'no_code'
  | 'state_mismatch'
  | 'exchange_failed';

export class AuthError extends Error {
  code: AuthErrorCode;
  detail?: string;

  constructor(code: AuthErrorCode, message: string, detail?: string) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array.buffer);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

function toAuthTokens(response: TokenResponse): AuthTokens {
  const now = Date.now();
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: now + response.expires_in * 1000,
    refreshExpiresAt: now + response.refresh_expires_in * 1000,
  };
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<TokenResponse> {
  const res = await fetch(`${WORKER_BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
  });
  if (!res.ok) {
    throw new AuthError('exchange_failed', `Token exchange failed: ${res.status}`, String(res.status));
  }
  return res.json();
}

export async function startLoginFlow(): Promise<AuthTokens> {
  const verifier = generateRandomToken();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateRandomToken();
  const redirectUri = browser.identity.getRedirectURL();

  const authUrl = new URL(KICK_AUTHORIZE_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', KICK_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', KICK_SCOPES.join(' '));
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  const responseUrl = await browser.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });
  if (!responseUrl) throw new AuthError('cancelled', 'Login was cancelled');

  const redirected = new URL(responseUrl);
  const code = redirected.searchParams.get('code');
  const returnedState = redirected.searchParams.get('state');
  const oauthError = redirected.searchParams.get('error');
  const oauthErrorDescription = redirected.searchParams.get('error_description');
  if (oauthError) {
    throw new AuthError(
      'oauth_rejected',
      `Kick rejected login: ${oauthError}${oauthErrorDescription ? ` — ${oauthErrorDescription}` : ''}`,
      oauthErrorDescription ?? oauthError
    );
  }
  if (!code) {
    throw new AuthError(
      'no_code',
      'No authorization code returned',
      redirected.search || 'empty query string'
    );
  }
  if (returnedState !== state) throw new AuthError('state_mismatch', 'OAuth state mismatch');

  const tokenResponse = await exchangeCodeForTokens(code, verifier, redirectUri);
  const tokens = toAuthTokens(tokenResponse);
  await authTokensStorage.setValue(tokens);
  return tokens;
}

export function isTokenExpiringSoon(
  tokens: AuthTokens,
  bufferMs = 2 * 60 * 1000
): boolean {
  return Date.now() >= tokens.expiresAt - bufferMs;
}

export async function refreshTokens(
  tokens: AuthTokens
): Promise<AuthTokens | null> {
  try {
    const res = await fetch(`${WORKER_BASE_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    });
    if (!res.ok) return null;
    const tokenResponse: TokenResponse = await res.json();
    const refreshed = toAuthTokens(tokenResponse);
    await authTokensStorage.setValue(refreshed);
    return refreshed;
  } catch {
    return null;
  }
}

// Single-flight guard: when multiple callers need a refresh at roughly the
// same time (e.g. the background alarm and a popup tab), they share one
// in-flight `refreshTokens()` call instead of each racing their own
// against Kick's rotating refresh tokens (the second call to redeem an
// already-rotated refresh token would fail and wrongly log the user out).
let inFlightRefresh: Promise<AuthTokens | null> | null = null;

function refreshTokensSingleFlight(tokens: AuthTokens): Promise<AuthTokens | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = refreshTokens(tokens).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await authTokensStorage.getValue();
  if (!tokens) return null;
  if (!isTokenExpiringSoon(tokens)) return tokens.accessToken;

  const refreshed = await refreshTokensSingleFlight(tokens);
  if (!refreshed) {
    await authTokensStorage.setValue(null);
    return null;
  }
  return refreshed.accessToken;
}

/**
 * Forces a refresh regardless of the proactive expiry check, sharing the
 * same single-flight in-flight promise as `getValidAccessToken`. Used when
 * a token that looked valid was rejected by the API anyway (server-side
 * revocation, clock skew, etc.).
 */
async function forceRefresh(tokens: AuthTokens): Promise<AuthTokens | null> {
  return refreshTokensSingleFlight(tokens);
}

/**
 * Runs `fn` with a valid access token, transparently recovering from a
 * reactive 401: gets a token via `getValidAccessToken()` (returns null
 * immediately if not logged in), calls `fn`, and if it throws a
 * `KickApiError` with `kind === 'unauthorized'`, forces one refresh and
 * retries `fn` once with the new token. If that also fails (or refresh
 * itself fails), auth state is cleared and null is returned so callers can
 * treat it as "not logged in" — the popup bounces to the login screen via
 * `authTokensStorage.watch()`, and background polling stops trying.
 */
export async function withAuthRetry<T>(
  fn: (accessToken: string) => Promise<T>
): Promise<T | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  try {
    return await fn(accessToken);
  } catch (err) {
    if (!(err instanceof KickApiError) || err.kind !== 'unauthorized') {
      throw err;
    }

    const tokens = await authTokensStorage.getValue();
    if (!tokens) return null;

    const refreshed = await forceRefresh(tokens);
    if (!refreshed) {
      await authTokensStorage.setValue(null);
      return null;
    }

    try {
      return await fn(refreshed.accessToken);
    } catch (retryErr) {
      if (retryErr instanceof KickApiError && retryErr.kind === 'unauthorized') {
        await authTokensStorage.setValue(null);
        return null;
      }
      throw retryErr;
    }
  }
}

export async function logout(): Promise<void> {
  await authTokensStorage.setValue(null);
}
