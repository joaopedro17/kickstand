import type { ChannelStatus, LiveStatusCache, TrackedChannel } from './storage';
import type { Livestream } from './types';

/** What one request for a batch of tracked channels came back with. */
export type BatchOutcome =
  | { ids: number[]; livestreams: Livestream[] }
  | { ids: number[]; error: string; rateLimitedForMs?: number };

type Polled = { id: number; entry: ChannelStatus; wentLive: boolean };

/**
 * Whether a live stream deserves a notification. At most one per stream:
 * a stream is identified by its start time, so a short drop and return of
 * the same stream stays quiet. A channel seen for the first time adopts the
 * stream it's already running silently.
 */
function isNewStream(previous: ChannelStatus | undefined, startedAt: string | null): boolean {
  if (!previous) return false;
  if (startedAt === null) return previous.status.kind === 'offline';
  return startedAt !== previous.notifiedStartedAt;
}

function liveEntry(
  previous: ChannelStatus | undefined,
  stream: Livestream,
  now: number
): ChannelStatus {
  const { startedAt } = stream;
  return {
    status: {
      kind: 'live',
      startedAt,
      viewerCount: stream.viewerCount,
      title: stream.title,
      category: stream.category,
      thumbnail: stream.thumbnail,
    },
    notifiedStartedAt: startedAt ?? previous?.notifiedStartedAt ?? null,
    avatarUrl: stream.broadcaster.profilePicture,
    lastCheckedAt: now,
  };
}

function offlineEntry(previous: ChannelStatus | undefined, now: number): ChannelStatus {
  if (!previous) {
    return {
      status: { kind: 'offline', lastLiveAt: null },
      notifiedStartedAt: null,
      avatarUrl: null,
      lastCheckedAt: now,
    };
  }
  const { status } = previous;
  return {
    status: { kind: 'offline', lastLiveAt: status.kind === 'live' ? now : status.lastLiveAt },
    notifiedStartedAt: previous.notifiedStartedAt,
    avatarUrl: previous.avatarUrl,
    lastCheckedAt: now,
  };
}

function pollBatch(previous: LiveStatusCache, batch: BatchOutcome, now: number): Polled[] {
  if ('error' in batch) {
    // A never-polled channel stays never polled: recording it as offline now
    // would make the stream it's already running look new next time.
    return batch.ids
      .filter((id) => previous[id])
      .map((id) => ({
        id,
        entry: { ...previous[id], lastError: batch.error, lastCheckedAt: now },
        wentLive: false,
      }));
  }
  const streamByUser = new Map(batch.livestreams.map((s) => [s.broadcaster.id, s]));
  return batch.ids.map((id) => {
    const stream = streamByUser.get(id);
    return stream
      ? {
          id,
          entry: liveEntry(previous[id], stream, now),
          wentLive: isNewStream(previous[id], stream.startedAt),
        }
      : { id, entry: offlineEntry(previous[id], now), wentLive: false };
  });
}

/**
 * Builds the next live-status cache from the outcome of each polled batch,
 * and the ids of channels that started a new stream. Starts empty rather
 * than from `previous`, so a channel that is no longer tracked is pruned.
 */
export function computeNextStatus(
  previous: LiveStatusCache,
  batches: BatchOutcome[],
  now: number
): { next: LiveStatusCache; wentLive: number[] } {
  const polled = batches.flatMap((batch) => pollBatch(previous, batch, now));
  return {
    next: Object.fromEntries(polled.map((p) => [p.id, p.entry])),
    wentLive: polled.filter((p) => p.wentLive).map((p) => p.id),
  };
}

export function channelsToNotify(tracked: TrackedChannel[], wentLive: number[]): TrackedChannel[] {
  const ids = new Set(wentLive);
  return tracked.filter((c) => ids.has(c.broadcasterUserId) && !c.muted);
}

export function countLive(cache: LiveStatusCache): number {
  return Object.values(cache).filter((e) => e.status.kind === 'live').length;
}

/** How old live status can get before opening the popup asks for a fresh poll. */
export const STALE_AFTER_MS = 60_000;

/** Whether the popup should ask for a poll: some tracked channel was never polled, or the latest poll is too old. */
export function isStale(tracked: TrackedChannel[], cache: LiveStatusCache, now: number): boolean {
  if (tracked.length === 0) return false;
  if (tracked.some((c) => !cache[c.broadcasterUserId])) return true;
  const newest = Math.max(...Object.values(cache).map((e) => e.lastCheckedAt));
  return now - newest > STALE_AFTER_MS;
}
