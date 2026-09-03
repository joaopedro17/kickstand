import { startLoginFlow, withAuthRetry, AuthError } from '@/lib/auth';
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

// Dynamic import, not a static top-level one: WXT's entrypoint-scanning pass
// (which runs on every `wxt prepare`/`wxt build`, including from a clean
// `.wxt/` directory — e.g. a fresh clone or CI) directly executes this file
// via a module runner to inspect it for `defineBackground()`, and does so
// before `@wxt-dev/i18n`'s `#i18n` alias target has been written to disk.
// A static `import { i18n } from '#i18n'` here fails that scan with
// "Cannot find module '#i18n'" — reproduced locally against wxt@0.20.27 and
// wxt@0.21.4, so it's an upstream ordering issue, not a config mistake. The
// same static import works fine in every popup component, which WXT bundles
// through its normal HTML-entrypoint pipeline instead of this direct-execute
// scan. Deferring the import until it's actually needed at runtime (inside
// `pollNow()`, well after the scan has finished) sidesteps it entirely.
async function getI18n() {
  return (await import('#i18n')).i18n;
}

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

const POLL_PERIOD_MINUTES = 5;

async function setupAlarm(): Promise<void> {
  await browser.alarms.create(POLL_ALARM, {
    periodInMinutes: POLL_PERIOD_MINUTES,
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
  if (settings.notificationsEnabled && wentLive.length > 0) {
    const i18n = await getI18n();
    for (const id of wentLive) {
      const channel = tracked.find((c) => c.broadcasterUserId === id);
      if (channel && !channel.muted) {
        await browser.notifications.create(`kickstand-live-${id}`, {
          type: 'basic',
          iconUrl: browser.runtime.getURL('/icons/128.png'),
          title: i18n.t('notifications.liveTitle', { slug: channel.slug }),
          message: next[id].category?.name ?? i18n.t('notifications.liveDefaultMessage'),
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
async function login(): Promise<
  { success: true } | { success: false; error: string; detail?: string }
> {
  try {
    await startLoginFlow();
    return { success: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { success: false, error: err.code, detail: err.detail };
    }
    return { success: false, error: 'unknown' };
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => setupAlarm());
  browser.runtime.onStartup.addListener(() => setupAlarm());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) pollNow();
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'poll-now') return pollNow();
    if (message?.type === 'login') return login();
  });
});
