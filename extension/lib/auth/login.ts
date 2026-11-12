import { browser } from 'wxt/browser';
import { KICK_AUTHORIZE_URL, KICK_CLIENT_ID, KICK_SCOPES, WORKER_BASE_URL } from '@/lib/config';
import type { TokenGrant } from '@/lib/kick/types';
import { readGrant, toAuthTokens } from './grant';
import { generateCodeChallenge, generateRandomToken } from './pkce';
import { authTokensStorage, type AuthTokens } from './storage';

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
