import { storage } from 'wxt/utils/storage';
import type { LiveStatusCache } from './live-status';

// Stored under a new key: entries in the old flat shape (local:liveStatus)
// are dropped, not converted. The first poll after an update then sees every
// channel as never polled and adopts running streams without notifying.
export const LEGACY_LIVE_STATUS_KEY = 'liveStatus';

export const liveStatusStorage = storage.defineItem<LiveStatusCache>(
  'local:channelStatus',
  { fallback: {} }
);

/** Polling is skipped until this time (ms since epoch) after Kick rate-limits it. */
export const pollPausedUntilStorage = storage.defineItem<number>('local:pollPausedUntil', {
  fallback: 0,
});
