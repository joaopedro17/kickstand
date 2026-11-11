import { browser } from 'wxt/browser';
import {
  KICK_AUTHORIZE_URL,
  KICK_CLIENT_ID,
  KICK_SCOPES,
  WORKER_BASE_URL,
} from './config';
import { authTokensStorage, type AuthTokens } from './storage';
import type { TokenGrant } from './types';
import { parseTokenResponse } from './kick-parse';
import { KickApiError } from './kick-api';
import { retryOnUnauthorized, type TokenSource } from './auth-retry';
import type { TokenReply } from './messages';

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

function toAuthTokens(grant: TokenGrant): AuthTokens {
  const now = Date.now();
  return {
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    expiresAt: now + grant.expiresInSeconds * 1000,
    refreshExpiresAt: now + grant.refreshExpiresInSeconds * 1000,
  };
}

/** The token proxy's answer as a grant, or null when it isn't a usable one. */
async function readGrant(res: Response): Promise<TokenGrant | null> {
  try {
    return parseTokenResponse(await res.json());
  } catch {
    return null;
  }
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<TokenGrant> {
  const res = await fetch(`${WORKER_BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
  });
  if (!res.ok) {
    throw new AuthError('exchange_failed', `Token exchange failed: ${res.status}`, String(res.status));
  }
  const grant = await readGrant(res);
  if (!grant) throw new AuthError('exchange_failed', 'Token exchange returned no usable tokens', 'malformed');
  return grant;
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

  const grant = await exchangeCodeForTokens(code, verifier, redirectUri);
  const tokens = toAuthTokens(grant);
  await authTokensStorage.setValue(tokens);
  return tokens;
}

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

export async function logout(): Promise<void> {
  await authTokensStorage.setValue(null);
}
