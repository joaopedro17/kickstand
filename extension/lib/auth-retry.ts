import { KickApiError } from './kick-api';

/** Where a context gets its access tokens from. */
export interface TokenSource {
  /** A usable access token, or null when there is no session. Throws a network KickApiError when none is available right now. */
  current(): Promise<string | null>;
  /** A replacement for a token Kick just rejected, or null when the session is over. */
  afterRejection(rejectedToken: string): Promise<string | null>;
  /** Ends the session. */
  endSession(): Promise<void>;
}

function isUnauthorized(err: unknown): boolean {
  return err instanceof KickApiError && err.kind === 'unauthorized';
}

/**
 * Runs `fn` with an access token from `source`, recovering once from a 401:
 * asks for a replacement for the rejected token and retries `fn` with it.
 *
 * Returns null when there is no session: not logged in, no replacement, or
 * the replacement was rejected too (the session is then ended). The popup
 * bounces to the login screen via `authTokensStorage.watch()`, and background
 * polling stops trying. Any other error from `fn` or `source` is rethrown.
 */
export async function retryOnUnauthorized<T>(
  source: TokenSource,
  fn: (accessToken: string) => Promise<T>
): Promise<T | null> {
  const accessToken = await source.current();
  if (!accessToken) return null;

  try {
    return await fn(accessToken);
  } catch (err) {
    if (!isUnauthorized(err)) throw err;
  }

  const retryToken = await source.afterRejection(accessToken);
  if (!retryToken) return null;

  try {
    return await fn(retryToken);
  } catch (retryErr) {
    if (!isUnauthorized(retryErr)) throw retryErr;
    await source.endSession();
    return null;
  }
}
