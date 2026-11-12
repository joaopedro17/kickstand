import { useEffect, useState } from 'react';
import { fetchCurrentUser } from '@/lib/kick/api';
import { withAuthRetry } from '@/lib/auth/client';
import { profileStorage, type CachedProfile } from '@/lib/storage';

/** How long a remembered profile picture is shown before asking Kick again. */
export const PROFILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isFresh(cached: CachedProfile, now: number): boolean {
  return now - cached.fetchedAt <= PROFILE_MAX_AGE_MS;
}

/** The remembered picture, refreshed from Kick at most once a day. */
async function loadAvatar(): Promise<string | null> {
  const cached = await profileStorage.getValue();
  if (cached && isFresh(cached, Date.now())) return cached.avatarUrl;
  const user = await withAuthRetry(fetchCurrentUser);
  if (!user) return cached?.avatarUrl ?? null;
  await profileStorage.setValue({ avatarUrl: user.profilePicture, fetchedAt: Date.now() });
  return user.profilePicture;
}

/**
 * The logged-in user's Kick profile picture, or null to show the settings
 * icon instead. A failure to reach Kick only means no picture this time.
 */
export function useAvatar(loggedIn: boolean): string | null {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!loggedIn) return;
    loadAvatar().then(setAvatarUrl, () => {});
  }, [loggedIn]);

  return avatarUrl;
}
