import { KICK_API_BASE } from '@/lib/config';
import { KickApiError } from './error';
import { fetchWithTimeout } from '@/lib/fetch-timeout';
import {
  parseCategoryPage,
  parseChannels,
  parseCurrentUser,
  parseUsers,
  parseLivestreamPage,
  parseLivestreams,
} from './parse';
import type { Category, Channel, CurrentUser, Livestream, Page } from './types';
import { chunk } from '@/lib/chunk';

type QueryParams = Record<string, string | number | (string | number)[] | undefined>;

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

/** Requests `path` and returns the body parsed by `parse`, or throws a KickApiError. */
async function kickFetch<T>(
  path: string,
  params: QueryParams,
  accessToken: string,
  parse: (body: unknown) => T
): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      buildUrl(path, params),
      { headers: { Authorization: `Bearer ${accessToken}` } },
      REQUEST_TIMEOUT_MS
    );
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

/** One request per `size` values of the repeated query parameter `name`, results merged in order. */
async function kickFetchInBatches<T>(
  path: string,
  name: string,
  values: string[] | number[],
  size: number,
  accessToken: string,
  parse: (body: unknown) => T[]
): Promise<T[]> {
  const results: T[] = [];
  for (const batch of chunk<string | number>(values, size)) {
    results.push(...(await kickFetch(path, { [name]: batch }, accessToken, parse)));
  }
  return results;
}

const MAX_SLUGS_PER_CHANNEL_REQUEST = 50;

export async function resolveChannelsBySlug(slugs: string[], accessToken: string): Promise<Channel[]> {
  return kickFetchInBatches('/public/v1/channels', 'slug', slugs, MAX_SLUGS_PER_CHANNEL_REQUEST, accessToken, parseChannels);
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

/** How many `id` values one users request carries. */
const MAX_IDS_PER_USERS_REQUEST = 50;

/** Any Kick users, by id: their profile pictures. */
export async function fetchUsers(ids: number[], accessToken: string): Promise<CurrentUser[]> {
  return kickFetchInBatches('/public/v1/users', 'id', ids, MAX_IDS_PER_USERS_REQUEST, accessToken, parseUsers);
}

const CATEGORY_PAGE_SIZE = 25;

/** One page of every category, in Kick's order. */
export async function fetchCategoryPage(
  cursor: string | undefined,
  accessToken: string
): Promise<Page<Category>> {
  return kickFetch(
    '/public/v2/categories',
    { cursor, limit: CATEGORY_PAGE_SIZE },
    accessToken,
    parseCategoryPage
  );
}

/** Categories whose name matches `name`. Kick answers a search in a single page. */
export async function searchCategories(name: string, accessToken: string): Promise<Category[]> {
  const found = await kickFetch(
    '/public/v2/categories',
    { name: [name], limit: CATEGORY_PAGE_SIZE },
    accessToken,
    parseCategoryPage
  );
  return found.items;
}
