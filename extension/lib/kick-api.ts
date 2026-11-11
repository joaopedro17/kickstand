import { KICK_API_BASE } from './config';
import { KickApiError } from './kick-error';
import {
  parseCategoryPage,
  parseChannels,
  parseCurrentUser,
  parseLivestreamPage,
  parseLivestreams,
} from './kick-parse';
import type { Category, Channel, CurrentUser, Livestream, Page } from './types';

export { KickApiError, type KickApiErrorKind } from './kick-error';

export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

type QueryParams = Record<string, string | number | string[] | number[] | undefined>;

function buildUrl(path: string, params: QueryParams): string {
  const url = new URL(`${KICK_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(v));
  }
  return url.toString();
}

/** A request Kick hasn't answered after this long is abandoned as a network error. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** A `Retry-After` header (seconds, or an HTTP date) as milliseconds from `now`; null if absent or unreadable. */
export function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  if (/^\d+$/.test(header)) return Number(header) * 1000;
  // An HTTP date names its day and month; without letters it's neither form.
  if (!/[a-z]/i.test(header)) return null;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

function errorFor(response: Response): KickApiError {
  const { status } = response;
  if (status === 401) return new KickApiError('unauthorized', 'Access token rejected', 401);
  if (status === 429) {
    const wait = retryAfterMs(response.headers?.get('Retry-After') ?? null, Date.now());
    return new KickApiError('rate-limited', 'Rate limited', 429, { retryAfterMs: wait ?? undefined });
  }
  return new KickApiError('other', `Request failed with status ${status}`, status);
}

/** fetch, abandoned after REQUEST_TIMEOUT_MS. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Requests `path` and returns the body parsed by `parse`, or throws a KickApiError. */
async function kickFetch<T>(
  path: string,
  params: QueryParams,
  accessToken: string,
  parse: (body: unknown) => T
): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(buildUrl(path, params), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new KickApiError('network', 'Network request failed');
  }
  if (!response.ok) throw errorFor(response);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new KickApiError('other', 'Kick sent a response that is not JSON');
  }
  return parse(body);
}

const MAX_SLUGS_PER_CHANNEL_REQUEST = 50;

export async function resolveChannelsBySlug(slugs: string[], accessToken: string): Promise<Channel[]> {
  const results: Channel[] = [];
  for (const batch of chunk(slugs, MAX_SLUGS_PER_CHANNEL_REQUEST)) {
    results.push(...(await kickFetch('/public/v1/channels', { slug: batch }, accessToken, parseChannels)));
  }
  return results;
}

/** Kick accepts at most this many `user_id` values per livestreams request. */
export const MAX_USERS_PER_LIVESTREAM_REQUEST = 100;

export async function fetchLivestreamsForUsers(
  userIds: number[],
  accessToken: string
): Promise<Livestream[]> {
  return kickFetch('/public/v1/users/livestreams', { user_id: userIds }, accessToken, parseLivestreams);
}

export async function fetchLivestreams(
  params: { categoryId?: number[]; cursor?: string; limit?: number },
  accessToken: string
): Promise<Page<Livestream>> {
  // Kick's API has no sort param — it returns livestreams oldest-started-first.
  // Sorting by viewer count has to happen client-side after fetching (see
  // BrowseTab), so callers should request a large `limit` to get a
  // representative sample instead of just the oldest few streams.
  return kickFetch(
    '/public/v2/livestreams',
    { category_id: params.categoryId, cursor: params.cursor, limit: params.limit },
    accessToken,
    parseLivestreamPage
  );
}

export async function fetchCurrentUser(accessToken: string): Promise<CurrentUser> {
  return kickFetch('/public/v1/users', {}, accessToken, parseCurrentUser);
}

export async function fetchCategories(
  params: { cursor?: string; limit?: number; name?: string[] },
  accessToken: string
): Promise<Page<Category>> {
  return kickFetch(
    '/public/v2/categories',
    { cursor: params.cursor, limit: params.limit, name: params.name },
    accessToken,
    parseCategoryPage
  );
}
