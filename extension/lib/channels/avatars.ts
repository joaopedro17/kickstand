import { storage } from 'wxt/utils/storage';
import type { CurrentUser } from '@/lib/kick/types';
import type { TrackedChannel } from './tracked';

/** Pictures are fetched again after a week, in case the broadcaster changed theirs. */
export const AVATAR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** A channel's profile picture as last fetched; url is null when the broadcaster has none. */
export interface Avatar {
  url: string | null;
  fetchedAt: number;
}

/** Keyed by broadcaster user id, so the Following tab can show offline channels' pictures. */
export const avatarStorage = storage.defineItem<Record<number, Avatar>>('local:channelAvatars', {
  fallback: {},
});

/** Tracked channels with no picture yet, or one older than AVATAR_MAX_AGE_MS. */
export function avatarsToRefresh(
  tracked: TrackedChannel[],
  avatars: Record<number, Avatar>,
  now: number
): number[] {
  return tracked
    .map((c) => c.broadcasterUserId)
    .filter((id) => !avatars[id] || now - avatars[id].fetchedAt > AVATAR_MAX_AGE_MS);
}

/**
 * Fetches the pictures that are missing or stale and keeps only tracked
 * channels'. `fetchUsers` returns null when there is no session; nothing
 * changes then.
 */
export async function refreshAvatars(
  tracked: TrackedChannel[],
  fetchUsers: (ids: number[]) => Promise<CurrentUser[] | null>,
  now: number
): Promise<void> {
  const current = await avatarStorage.getValue();
  const stale = avatarsToRefresh(tracked, current, now);
  if (stale.length === 0) return;
  const users = await fetchUsers(stale);
  if (!users) return;
  const pictures = new Map(users.map((u) => [u.userId, u.profilePicture]));
  const fetched = stale.map((id) => [id, { url: pictures.get(id) ?? null, fetchedAt: now }]);
  const kept = tracked.filter((c) => current[c.broadcasterUserId]).map((c) => [c.broadcasterUserId, current[c.broadcasterUserId]]);
  await avatarStorage.setValue(Object.fromEntries([...kept, ...fetched]));
}
