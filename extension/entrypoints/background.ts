import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { startLoginFlow, AuthError } from '@/lib/auth/login';
import { answerTokenRequest } from '@/lib/auth/tokens';
import { logout } from '@/lib/auth/logout';
import { listenForRequests, type LoginResult } from '@/lib/messages';
import { getTracked, watchTracked } from '@/lib/channels/tracked';
import { LEGACY_LIVE_STATUS_KEY } from '@/lib/polling/storage';
import { profileStorage } from '@/lib/auth/storage';
import { watchSettings } from '@/lib/settings';
import {
  ensurePollAlarm,
  forgetSessionData,
  openNotifiedChannel,
  pollNow,
  POLL_ALARM,
  syncToTracked,
} from '@/lib/polling/poll';

// Runs the OAuth flow here rather than in the popup: launchWebAuthFlow opens
// a new window, which steals focus and causes the extension popup to close
// — killing the popup's JS context mid-flow before the token exchange ever
// completes. The background service worker persists across that focus
// change, so it's the only place this can reliably finish. The popup picks
// up the result via authTokensStorage.watch() once it's next opened.
async function login(): Promise<LoginResult> {
  try {
    await startLoginFlow();
  } catch (err) {
    return err instanceof AuthError
      ? { success: false, error: err.code, detail: err.detail }
      : { success: false, error: 'unknown' };
  }
  // The picture of whoever was logged in before must not show for this account.
  await profileStorage.setValue(null);
  // Fill the badge now rather than at the next alarm.
  pollNow();
  return { success: true };
}

async function onInstalledOrUpdated(): Promise<void> {
  // Moves a tracked list stored by an earlier version into today's format.
  await getTracked();
  // Earlier versions cached live status in another shape. Dropping it makes
  // the next poll adopt running streams without notifying for them.
  await browser.storage.local.remove(LEGACY_LIVE_STATUS_KEY);
  await pollNow();
}

export default defineBackground(() => {
  // Explicit colors instead of the browser default: the default badge
  // background is theme-dependent and, on a dark toolbar theme, renders as a
  // dark badge with dark text — nearly unreadable.
  browser.action.setBadgeBackgroundColor({ color: '#2121214b' });
  browser.action.setBadgeTextColor({ color: '#FFFFFF' });

  // Every time the worker starts, not just on install or browser start: an
  // alarm lost for any reason would otherwise stop polling until the next
  // browser restart.
  ensurePollAlarm();
  // Any settings change: ensurePollAlarm leaves an alarm that already has
  // the right period alone.
  watchSettings(() => ensurePollAlarm());

  browser.runtime.onInstalled.addListener(() => onInstalledOrUpdated());
  browser.runtime.onStartup.addListener(() => pollNow());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) pollNow();
  });

  // Removing a channel updates the badge immediately; adding one is
  // followed by a poll the popup asks for.
  watchTracked(syncToTracked);

  browser.runtime.onMessage.addListener(
    listenForRequests({
      'poll-now': () => pollNow(),
      login: () => login(),
      'get-access-token': answerTokenRequest,
      // Local data first: logout() then waits on Kick to revoke the tokens.
      logout: async () => {
        await forgetSessionData();
        await logout();
      },
    })
  );

  browser.notifications.onClicked.addListener(openNotifiedChannel);
});
