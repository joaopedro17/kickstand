import { KICK_API_BASE } from './config';
import type {
  KickCategoryWithTags,
  KickChannel,
  KickLivestream,
  KickUser,
  PaginatedResponse,
} from './types';

export type KickApiErrorKind = 'network' | 'unauthorized' | 'rate-limited' | 'other';

export class KickApiError extends Error {
  kind: KickApiErrorKind;
  status?: number;

  constructor(kind: KickApiErrorKind, message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

type QueryParams = Record<string, string | number | string[] | number[] | undefined>;

async function kickFetch<T>(
  path: string,
  params: QueryParams,
  accessToken: string
): Promise<T> {
  const url = new URL(`${KICK_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, String(v));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new KickApiError('network', 'Network request failed');
  }

  if (response.status === 401) {
    throw new KickApiError('unauthorized', 'Access token rejected', 401);
  }
  if (response.status === 429) {
    throw new KickApiError('rate-limited', 'Rate limited', 429);
  }
  if (!response.ok) {
    throw new KickApiError('other', `Request failed with status ${response.status}`, response.status);
  }

  return response.json();
}

export async function resolveChannelsBySlug(
  slugs: string[],
  accessToken: string
): Promise<KickChannel[]> {
  const results: KickChannel[] = [];
  for (const batch of chunk(slugs, 50)) {
    const res = await kickFetch<{ data: KickChannel[] }>(
      '/public/v1/channels',
      { slug: batch },
      accessToken
    );
    results.push(...res.data);
  }
  return results;
}

export async function fetchLivestreamsForUsers(
  userIds: number[],
  accessToken: string
): Promise<KickLivestream[]> {
  const results: KickLivestream[] = [];
  for (const batch of chunk(userIds, 100)) {
    const res = await kickFetch<{ data: KickLivestream[] }>(
      '/public/v1/users/livestreams',
      { user_id: batch },
      accessToken
    );
    results.push(...res.data);
  }
  return results;
}

export async function fetchLivestreams(
  params: { categoryId?: number[]; cursor?: string; limit?: number },
  accessToken: string
): Promise<PaginatedResponse<KickLivestream>> {
  // Kick's API has no sort param — it returns livestreams oldest-started-first.
  // Sorting by viewer count has to happen client-side after fetching (see
  // BrowseTab), so callers should request a large `limit` to get a
  // representative sample instead of just the oldest few streams.
  return kickFetch<PaginatedResponse<KickLivestream>>(
    '/public/v2/livestreams',
    {
      category_id: params.categoryId,
      cursor: params.cursor,
      limit: params.limit,
    },
    accessToken
  );
}

export async function fetchCurrentUser(accessToken: string): Promise<KickUser> {
  const res = await kickFetch<{ data: KickUser[] }>('/public/v1/users', {}, accessToken);
  return res.data[0];
}

export async function fetchCategories(
  params: { cursor?: string; limit?: number; name?: string[] },
  accessToken: string
): Promise<PaginatedResponse<KickCategoryWithTags>> {
  return kickFetch<PaginatedResponse<KickCategoryWithTags>>(
    '/public/v2/categories',
    { cursor: params.cursor, limit: params.limit, name: params.name },
    accessToken
  );
}
