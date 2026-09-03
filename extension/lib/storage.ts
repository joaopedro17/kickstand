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

export interface LiveStatusEntry {
  isLive: boolean;
  viewerCount: number;
  category: { id: number; name: string } | null;
  thumbnail: string | null;
  title: string;
  lastCheckedAt: number;
  lastError?: string;
}

export type LiveStatusCache = Record<number, LiveStatusEntry>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
};

export const trackedChannelsStorage = storage.defineItem<TrackedChannel[]>(
  'sync:trackedChannels',
  { fallback: [] }
);

export const settingsStorage = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

export const liveStatusStorage = storage.defineItem<LiveStatusCache>(
  'local:liveStatus',
  { fallback: {} }
);

export const authTokensStorage = storage.defineItem<AuthTokens | null>(
  'local:authTokens',
  { fallback: null }
);

export function diffLiveTransitions(
  previous: LiveStatusCache,
  next: LiveStatusCache
): number[] {
  const wentLive: number[] = [];
  for (const [idStr, entry] of Object.entries(next)) {
    const id = Number(idStr);
    const wasLive = previous[id]?.isLive ?? false;
    if (entry.isLive && !wasLive) {
      wentLive.push(id);
    }
  }
  return wentLive;
}
