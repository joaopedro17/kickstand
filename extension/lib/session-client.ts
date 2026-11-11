import { retryOnUnauthorized, type TokenSource } from './auth-retry';
import { KickApiError } from './kick-api';
import { sendRequest, type TokenReply } from './messages';

/**
 * The popup's side of the session. The popup never reads or writes the stored
 * tokens: it asks the background, which is their only writer. Two contexts
 * each refreshing on their own would both redeem Kick's rotating refresh
 * token, and the loser's rejection would log the user out.
 */

function toToken(reply: TokenReply): string | null {
  if (reply.status === 'ok') return reply.accessToken;
  if (reply.status === 'logged-out') return null;
  throw new KickApiError('network', 'Could not refresh the session right now');
}

const popupTokens: TokenSource = {
  current: async () => toToken(await sendRequest({ type: 'get-access-token' })),
  afterRejection: async (rejectedToken) =>
    toToken(await sendRequest({ type: 'get-access-token', rejectedToken })),
  endSession: () => requestLogout(),
};

/** `retryOnUnauthorized` for code running in the popup. */
export function withAuthRetry<T>(fn: (accessToken: string) => Promise<T>): Promise<T | null> {
  return retryOnUnauthorized(popupTokens, fn);
}

export function requestLogout(): Promise<void> {
  return sendRequest({ type: 'logout' });
}
