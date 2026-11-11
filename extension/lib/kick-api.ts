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

function errorFor(status: number): KickApiError {
  if (status === 401) return new KickApiError('unauthorized', 'Access token rejected', 401);
  if (status === 429) return new KickApiError('rate-limited', 'Rate limited', 429);
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
    response = await fetch(buildUrl(path, params), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new KickApiError('network', 'Network request failed');
  }
  if (!response.ok) throw errorFor(response.status);

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
