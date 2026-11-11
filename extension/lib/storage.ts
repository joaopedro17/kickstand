import { storage } from 'wxt/utils/storage';

export interface TrackedChannel {
  broadcasterUserId: number;
  slug: string;
  addedAt: number;
  muted: boolean;
}

export interface Settings {
  notificationsEnabled: boolean;
}

/**
 * What the last poll learned about a channel. Only a live channel has stream
 * details, so an offline channel can't carry a stale viewer count or title.
 */
export type LiveStatus =
  | {
      kind: 'live';
      /** Kick's `started_at`, compared as an opaque string; null when Kick omits it. */
      startedAt: string | null;
      viewerCount: number;
      title: string;
      category: { id: number; name: string } | null;
      thumbnail: string | null;
    }
  | { kind: 'offline'; lastLiveAt: number | null };

export interface ChannelStatus {
  status: LiveStatus;
  /** The stream Kickstand last notified for (or adopted silently); at most one notification per stream. */
  notifiedStartedAt: string | null;
  avatarUrl: string | null;
  lastCheckedAt: number;
  lastError?: string;
}

/** Keyed by broadcaster user id. A tracked channel with no entry has never been polled. */
export type LiveStatusCache = Record<number, ChannelStatus>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
};

export const settingsStorage = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

// Stored under a new key: entries in the old flat shape (local:liveStatus)
// are dropped, not converted. The first poll after an update then sees every
// channel as never polled and adopts running streams without notifying.
export const LEGACY_LIVE_STATUS_KEY = 'liveStatus';

export const liveStatusStorage = storage.defineItem<LiveStatusCache>(
  'local:channelStatus',
  { fallback: {} }
);

export const authTokensStorage = storage.defineItem<AuthTokens | null>(
  'local:authTokens',
  { fallback: null }
);

/** Polling is skipped until this time (ms since epoch) after Kick rate-limits it. */
export const pollPausedUntilStorage = storage.defineItem<number>('local:pollPausedUntil', {
  fallback: 0,
});
