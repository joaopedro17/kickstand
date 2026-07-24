import { startLoginFlow, withAuthRetry } from '@/lib/auth';
import { fetchLivestreamsForUsers, chunk } from '@/lib/kick-api';
import {
  trackedChannelsStorage,
  settingsStorage,
  liveStatusStorage,
  diffLiveTransitions,
  type LiveStatusCache,
  type LiveStatusEntry,
} from '@/lib/storage';

const POLL_ALARM = 'kickstand-poll';

function emptyEntry(): LiveStatusEntry {
  return {
    isLive: false,
    viewerCount: 0,
    category: null,
    thumbnail: null,
    title: '',
    lastCheckedAt: 0,
  };
}

async function setupAlarm(): Promise<void> {
  const settings = await settingsStorage.getValue();
  await browser.alarms.create(POLL_ALARM, {
    periodInMinutes: settings.pollingIntervalMinutes,
  });
}

export async function pollNow(): Promise<void> {
  const tracked = await trackedChannelsStorage.getValue();
  if (tracked.length === 0) {
    await browser.action.setBadgeText({ text: '' });
    return;
  }

  const previous = await liveStatusStorage.getValue();
  // Start empty (not `{ ...previous }`) so entries for channels no longer
  // tracked are pruned rather than carried forward indefinitely — otherwise
  // a stale `isLive: true` entry for an untracked channel would inflate the
  // badge count forever, since the count sums over the whole cache.
  const next: LiveStatusCache = {};
  const ids = tracked.map((c) => c.broadcasterUserId);

  for (const batch of chunk(ids, 100)) {
    try {
      const livestreams = await withAuthRetry((accessToken) =>
        fetchLivestreamsForUsers(batch, accessToken)
      );
      if (livestreams === null) {
        // Not logged in, or auth failed even after a refresh-and-retry —
        // stop polling and clear the badge rather than keep hammering a
        // dead token or displaying stale live status.
        await browser.action.setBadgeText({ text: '' });
        return;
      }
      for (const id of batch) {
        const stream = livestreams.find((l) => l.broadcaster_user.id === id);
        next[id] = stream
          ? {
              isLive: true,
              viewerCount: stream.viewer_count,
              category: stream.category,
              thumbnail: stream.thumbnail,
              title: stream.title,
              lastCheckedAt: Date.now(),
            }
          : {
              ...(previous[id] ?? emptyEntry()),
              isLive: false,
              lastCheckedAt: Date.now(),
            };
      }
    } catch (err) {
      for (const id of batch) {
        next[id] = {
          ...(previous[id] ?? emptyEntry()),
          lastError: err instanceof Error ? err.message : String(err),
          lastCheckedAt: Date.now(),
        };
      }
    }
  }

  const wentLive = diffLiveTransitions(previous, next);
  const settings = await settingsStorage.getValue();
  if (settings.notificationsEnabled) {
    for (const id of wentLive) {
      const channel = tracked.find((c) => c.broadcasterUserId === id);
      if (channel && !channel.muted) {
        await browser.notifications.create(`kickstand-live-${id}`, {
          type: 'basic',
          iconUrl: browser.runtime.getURL('/icons/128.png'),
          title: `${channel.slug} is live!`,
          message: next[id].category?.name ?? 'Streaming now on Kick',
        });
      }
    }
  }

  await liveStatusStorage.setValue(next);
  const liveCount = Object.values(next).filter((e) => e.isLive).length;
  await browser.action.setBadgeText({ text: liveCount > 0 ? String(liveCount) : '' });
}

// Runs the OAuth flow here rather than in the popup: launchWebAuthFlow opens
// a new window, which steals focus and causes the extension popup to close
// — killing the popup's JS context mid-flow before the token exchange ever
// completes. The background service worker persists across that focus
// change, so it's the only place this can reliably finish. The popup picks
// up the result via authTokensStorage.watch() once it's next opened.
async function login(): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await startLoginFlow();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Login failed' };
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => setupAlarm());
  browser.runtime.onStartup.addListener(() => setupAlarm());
  settingsStorage.watch(() => setupAlarm());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) pollNow();
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'poll-now') return pollNow();
    if (message?.type === 'login') return login();
  });
});
