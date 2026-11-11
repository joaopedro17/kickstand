import {
  diffLiveTransitions,
  type LiveStatusCache,
  type LiveStatusEntry,
  type TrackedChannel,
} from './storage';
import type { KickLivestream } from './types';

/** What one request for a batch of tracked channels came back with. */
export type BatchOutcome =
  | { ids: number[]; livestreams: KickLivestream[] }
  | { ids: number[]; error: string };

function emptyEntry(): LiveStatusEntry {
  return {
    isLive: false,
    viewerCount: 0,
    category: null,
    thumbnail: null,
    title: '',
    avatarUrl: null,
    lastCheckedAt: 0,
  };
}

function liveEntry(stream: KickLivestream, now: number): LiveStatusEntry {
  return {
    isLive: true,
    viewerCount: stream.viewer_count,
    category: stream.category,
    thumbnail: stream.thumbnail,
    title: stream.title,
    avatarUrl: stream.broadcaster_user.profile_picture,
    lastCheckedAt: now,
  };
}

function entriesForBatch(
  previous: LiveStatusCache,
  batch: BatchOutcome,
  now: number
): [number, LiveStatusEntry][] {
  if ('error' in batch) {
    return batch.ids.map((id) => [
      id,
      { ...(previous[id] ?? emptyEntry()), lastError: batch.error, lastCheckedAt: now },
    ]);
  }
  const streamByUser = new Map(batch.livestreams.map((s) => [s.broadcaster_user.id, s]));
  return batch.ids.map((id) => {
    const stream = streamByUser.get(id);
    return [
      id,
      stream
        ? liveEntry(stream, now)
        : { ...(previous[id] ?? emptyEntry()), isLive: false, lastCheckedAt: now },
    ];
  });
}

/**
 * Builds the next live-status cache from the outcome of each polled batch.
 * Starts empty rather than from `previous`, so a channel that is no longer
 * tracked (and therefore no longer in any batch) is pruned instead of
 * inflating the badge count forever.
 */
export function computeNextStatus(
  previous: LiveStatusCache,
  batches: BatchOutcome[],
  now: number
): LiveStatusCache {
  return Object.fromEntries(batches.flatMap((batch) => entriesForBatch(previous, batch, now)));
}

export function channelsToNotify(
  tracked: TrackedChannel[],
  previous: LiveStatusCache,
  next: LiveStatusCache
): TrackedChannel[] {
  const wentLive = new Set(diffLiveTransitions(previous, next));
  return tracked.filter((c) => wentLive.has(c.broadcasterUserId) && !c.muted);
}

export function countLive(cache: LiveStatusCache): number {
  return Object.values(cache).filter((e) => e.isLive).length;
}
