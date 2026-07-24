import {
  KICK_AUTHORIZE_URL,
  KICK_CLIENT_ID,
  KICK_SCOPES,
  WORKER_BASE_URL,
} from './config';
import { authTokensStorage, type AuthTokens } from './storage';
import type { TokenResponse } from './types';

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
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
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
  if (!responseUrl) throw new Error('Login was cancelled');

  const redirected = new URL(responseUrl);
  const code = redirected.searchParams.get('code');
  const returnedState = redirected.searchParams.get('state');
  if (!code) throw new Error('No authorization code returned');
  if (returnedState !== state) throw new Error('OAuth state mismatch');

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

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await authTokensStorage.getValue();
  if (!tokens) return null;
  if (!isTokenExpiringSoon(tokens)) return tokens.accessToken;

  const refreshed = await refreshTokens(tokens);
  if (!refreshed) {
    await authTokensStorage.setValue(null);
    return null;
  }
  return refreshed.accessToken;
}

export async function logout(): Promise<void> {
  await authTokensStorage.setValue(null);
}
