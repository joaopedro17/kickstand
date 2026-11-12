import { useEffect, useState } from 'react';
import { withAuthRetry } from '@/lib/auth/client';
import {
  addChannels,
  getTracked,
  watchTracked,
  type AddOutcome,
  type TrackedChannel,
} from '@/lib/channels/tracked';
import { resolveChannelsBySlug } from '@/lib/kick/api';
import type { Channel } from '@/lib/kick/types';
import { sendRequest } from '@/lib/messages';

/** Tracks the channels, and asks the background to poll when any is new so its status shows straight away. */
export async function trackChannels(channels: Channel[]): Promise<AddOutcome> {
  const outcome = await addChannels(channels, Date.now());
  // A failed poll shows up as stale live status, not as a failure to add.
  if (outcome.added.length > 0) sendRequest({ type: 'poll-now' }).catch(() => {});
  return outcome;
}

export interface SlugOutcome extends AddOutcome {
  /** Slugs Kick has no channel for. */
  notFound: string[];
}

/** Looks the slugs up with Kick in one request and tracks the channels found; null when logged out. */
export async function trackSlugs(slugs: string[]): Promise<SlugOutcome | null> {
  const found = await withAuthRetry((accessToken) => resolveChannelsBySlug(slugs, accessToken));
  if (!found) return null;
  const foundSlugs = new Set(found.map((c) => c.slug.toLowerCase()));
  return {
    ...(await trackChannels(found)),
    notFound: slugs.filter((slug) => !foundSlugs.has(slug)),
  };
}

/** The tracked list, kept current as it changes here or on another device. */
export function useTracked(): TrackedChannel[] {
  const [channels, setChannels] = useState<TrackedChannel[]>([]);
  useEffect(() => {
    getTracked().then(setChannels);
    return watchTracked(setChannels);
  }, []);
  return channels;
}
