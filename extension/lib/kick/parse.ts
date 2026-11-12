import { KickApiError } from './error';
import type { Category, Channel, CurrentUser, Livestream, Page, TokenGrant } from './types';

/**
 * Turns Kick's JSON into Kickstand's types, once, where it enters. Inside
 * the extension the types are trusted.
 *
 * A list item missing something essential (an id, a slug) is skipped, so
 * one odd stream can't blank the whole Browse tab. Missing extras get a
 * neutral default. A response whose overall shape is wrong is rejected.
 */

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function unexpected(what: string): KickApiError {
  return new KickApiError('other', `Unexpected response from Kick: ${what}`);
}

function dataList(raw: unknown): unknown[] {
  if (!isObject(raw) || !Array.isArray(raw.data)) throw unexpected('no data list');
  return raw.data;
}

function parseEach<T>(raw: unknown, parseItem: (item: unknown) => T | null): T[] {
  return dataList(raw)
    .map(parseItem)
    .filter((item): item is T => item !== null);
}

function nextCursor(raw: unknown): string | null {
  const pagination = isObject(raw) ? raw.pagination : undefined;
  return isObject(pagination) ? nonEmptyText(pagination.next_cursor) : null;
}

function parsePage<T>(raw: unknown, parseItem: (item: unknown) => T | null): Page<T> {
  return { items: parseEach(raw, parseItem), nextCursor: nextCursor(raw) };
}

function streamCategory(raw: unknown): Livestream['category'] {
  if (!isObject(raw)) return null;
  const id = count(raw.id);
  const name = text(raw.name);
  return id === null || name === null ? null : { id, name };
}

function streamId(raw: unknown): string | null {
  return typeof raw === 'number' ? String(raw) : nonEmptyText(raw);
}

function textOrEmpty(value: unknown): string {
  return text(value) ?? '';
}

function parseBroadcaster(raw: unknown): Livestream['broadcaster'] | null {
  if (!isObject(raw)) return null;
  const id = count(raw.id);
  if (id === null) return null;
  return {
    id,
    username: textOrEmpty(raw.username),
    profilePicture: nonEmptyText(raw.profile_picture),
  };
}

function channelSlug(raw: unknown): string | null {
  return isObject(raw) ? nonEmptyText(raw.slug) : null;
}

function parseLivestream(raw: unknown): Livestream | null {
  if (!isObject(raw)) return null;
  const id = streamId(raw.id);
  const broadcaster = parseBroadcaster(raw.broadcaster_user);
  const slug = channelSlug(raw.channel);
  const viewerCount = count(raw.viewer_count);
  if (id === null || broadcaster === null || slug === null || viewerCount === null) return null;
  return {
    id,
    broadcaster,
    slug,
    title: textOrEmpty(raw.title),
    category: streamCategory(raw.category),
    thumbnail: nonEmptyText(raw.thumbnail),
    startedAt: nonEmptyText(raw.started_at),
    viewerCount,
    hasMatureContent: raw.has_mature_content === true,
    languageCode: textOrEmpty(raw.language_code),
  };
}

function parseCategory(raw: unknown): Category | null {
  if (!isObject(raw)) return null;
  const id = count(raw.id);
  const name = nonEmptyText(raw.name);
  if (id === null || name === null) return null;
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : [];
  return { id, name, thumbnail: nonEmptyText(raw.thumbnail), tags };
}

function parseChannel(raw: unknown): Channel | null {
  if (!isObject(raw)) return null;
  const broadcasterUserId = count(raw.broadcaster_user_id);
  const slug = nonEmptyText(raw.slug);
  return broadcasterUserId === null || slug === null ? null : { broadcasterUserId, slug };
}

function parseUser(raw: unknown): CurrentUser | null {
  if (!isObject(raw)) return null;
  const userId = count(raw.user_id);
  return userId === null ? null : { userId, profilePicture: nonEmptyText(raw.profile_picture) };
}

export function parseLivestreams(raw: unknown): Livestream[] {
  return parseEach(raw, parseLivestream);
}

export function parseLivestreamPage(raw: unknown): Page<Livestream> {
  return parsePage(raw, parseLivestream);
}

export function parseCategoryPage(raw: unknown): Page<Category> {
  return parsePage(raw, parseCategory);
}

export function parseChannels(raw: unknown): Channel[] {
  return parseEach(raw, parseChannel);
}

export function parseUsers(raw: unknown): CurrentUser[] {
  return parseEach(raw, parseUser);
}

export function parseCurrentUser(raw: unknown): CurrentUser {
  const [user] = parseEach(raw, parseUser);
  if (!user) throw unexpected('no user');
  return user;
}

export function parseTokenResponse(raw: unknown): TokenGrant {
  if (!isObject(raw)) throw unexpected('token response is not an object');
  const accessToken = nonEmptyText(raw.access_token);
  const refreshToken = nonEmptyText(raw.refresh_token);
  const expiresInSeconds = count(raw.expires_in);
  const refreshExpiresInSeconds = count(raw.refresh_expires_in);
  if (!accessToken || !refreshToken || expiresInSeconds === null || refreshExpiresInSeconds === null) {
    throw unexpected('incomplete token response');
  }
  return { accessToken, refreshToken, expiresInSeconds, refreshExpiresInSeconds };
}
