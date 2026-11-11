import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { startLoginFlow, withAuthRetry, AuthError } from '@/lib/auth';
import {
  fetchLivestreamsForUsers,
  chunk,
  MAX_USERS_PER_LIVESTREAM_REQUEST,
} from '@/lib/kick-api';
import {
  computeNextStatus,
  channelsToNotify,
  countLive,
  type BatchOutcome,
} from '@/lib/poller';
import {
  trackedChannelsStorage,
  settingsStorage,
  liveStatusStorage,
  type LiveStatusCache,
  type TrackedChannel,
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

const POLL_PERIOD_MINUTES = 5;

async function setupAlarm(): Promise<void> {
  await browser.alarms.create(POLL_ALARM, {
    periodInMinutes: POLL_PERIOD_MINUTES,
  });
}

async function fetchBatch(ids: number[]): Promise<BatchOutcome | null> {
  try {
    const livestreams = await withAuthRetry((accessToken) =>
      fetchLivestreamsForUsers(ids, accessToken)
    );
    return livestreams === null ? null : { ids, livestreams };
  } catch (err) {
    return { ids, error: err instanceof Error ? err.message : String(err) };
  }
}

async function notifyLive(channels: TrackedChannel[], status: LiveStatusCache): Promise<void> {
  const i18n = await getI18n();
  for (const channel of channels) {
    const entry = status[channel.broadcasterUserId];
    await browser.notifications.create(`kickstand-live-${channel.broadcasterUserId}`, {
      type: 'basic',
      iconUrl: entry.avatarUrl || browser.runtime.getURL('/icons/128.png'),
      title: i18n.t('notifications.liveTitle', { slug: channel.slug }),
      message: entry.title || i18n.t('notifications.liveDefaultMessage'),
    });
  }
}

export async function pollNow(): Promise<void> {
  const tracked = await trackedChannelsStorage.getValue();
  if (tracked.length === 0) {
    await browser.action.setBadgeText({ text: '' });
    return;
  }

  const previous = await liveStatusStorage.getValue();
  const ids = tracked.map((c) => c.broadcasterUserId);

  const batches: BatchOutcome[] = [];
  for (const batchIds of chunk(ids, MAX_USERS_PER_LIVESTREAM_REQUEST)) {
    const outcome = await fetchBatch(batchIds);
    if (outcome === null) {
      // Not logged in, or auth failed even after a refresh-and-retry —
      // stop polling and clear the badge rather than keep hammering a
      // dead token or displaying stale live status.
      await browser.action.setBadgeText({ text: '' });
      return;
    }
    batches.push(outcome);
  }

  const next = computeNextStatus(previous, batches, Date.now());

  const settings = await settingsStorage.getValue();
  if (settings.notificationsEnabled) {
    const toNotify = channelsToNotify(tracked, previous, next);
    if (toNotify.length > 0) await notifyLive(toNotify, next);
  }

  await liveStatusStorage.setValue(next);
  const liveCount = countLive(next);
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
  // Explicit colors instead of the browser default: the default badge
  // background is theme-dependent and, on a dark toolbar theme, renders as a
  // dark badge with dark text — nearly unreadable.
  browser.action.setBadgeBackgroundColor({ color: '#2121214b' });
  browser.action.setBadgeTextColor({ color: '#FFFFFF' });

  browser.runtime.onInstalled.addListener(() => setupAlarm());
  browser.runtime.onStartup.addListener(() => setupAlarm());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) pollNow();
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'poll-now') return pollNow();
    if (message?.type === 'login') return login();
  });

  browser.notifications.onClicked.addListener(async (notificationId) => {
    const match = notificationId.match(/^kickstand-live-(\d+)$/);
    if (!match) return;
    const id = Number(match[1]);
    const tracked = await trackedChannelsStorage.getValue();
    const channel = tracked.find((c) => c.broadcasterUserId === id);
    if (channel) {
      browser.tabs.create({ url: `https://kick.com/${channel.slug}` });
    }
    browser.notifications.clear(notificationId);
  });
});
