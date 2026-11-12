import { browser } from 'wxt/browser';
import { chunk } from '@/lib/chunk';
import { fetchLivestreamsForUsers, MAX_USERS_PER_LIVESTREAM_REQUEST } from '@/lib/kick/api';
import { KickApiError } from '@/lib/kick/error';
import {
  channelsToNotify,
  computeNextStatus,
  countLive,
  type BatchOutcome,
  type LiveStatusCache,
} from './live-status';
import { withAuthRetry } from '@/lib/auth/tokens';
import { liveStatusStorage, pollPausedUntilStorage, pollRateLimitedStorage } from './storage';
import { profileStorage } from '@/lib/auth/storage';
import { type TrackedChannel, getTracked } from '@/lib/channels/tracked';
import { getSettings, isQuietTime } from '@/lib/settings';
import { notifyChannels } from './alerts';
import { playAlertSound } from './sound';

export const POLL_ALARM = 'kickstand-poll';
/** How often to poll while Kick is rate-limiting, whatever the user picked. */
const RATE_LIMITED_PERIOD_MINUTES = 5;
/** How long to back off after a 429 that doesn't say how long to wait. */
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;

/** The only place the toolbar badge is set. */
async function showOnBadge(cache: LiveStatusCache): Promise<void> {
  const live = countLive(cache);
  await browser.action.setBadgeText({ text: live > 0 ? String(live) : '' });
}

/**
 * Makes the poll alarm run at the user's interval, or every five minutes
 * while Kick is rate-limiting. An alarm already at that period keeps its
 * schedule.
 */
export async function ensurePollAlarm(): Promise<void> {
  const { pollIntervalMinutes } = await getSettings();
  const rateLimited = await pollRateLimitedStorage.getValue();
  const period = rateLimited ? Math.max(pollIntervalMinutes, RATE_LIMITED_PERIOD_MINUTES) : pollIntervalMinutes;
  if ((await browser.alarms.get(POLL_ALARM))?.periodInMinutes === period) return;
  // Creating an alarm under an existing name replaces it.
  await browser.alarms.create(POLL_ALARM, { periodInMinutes: period });
}

async function fetchBatch(ids: number[]): Promise<BatchOutcome | null> {
  try {
    const livestreams = await withAuthRetry((accessToken) =>
      fetchLivestreamsForUsers(ids, accessToken)
    );
    return livestreams === null ? null : { ids, livestreams };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (err instanceof KickApiError && err.kind === 'rate-limited') {
      return { ids, error, rateLimitedForMs: err.retryAfterMs ?? DEFAULT_RATE_LIMIT_WAIT_MS };
    }
    return { ids, error };
  }
}

/**
 * After a 429, polls are skipped for as long as Kick asked (the longest,
 * across batches) and slowed down until a poll goes through.
 */
async function pauseIfRateLimited(batches: BatchOutcome[], now: number): Promise<void> {
  const waits = batches.map((b) => ('rateLimitedForMs' in b ? (b.rateLimitedForMs ?? 0) : 0));
  const longest = Math.max(0, ...waits);
  if (longest > 0) await pollPausedUntilStorage.setValue(now + longest);
  await pollRateLimitedStorage.setValue(longest > 0);
  await ensurePollAlarm();
}

/** Every batch's outcome, or null as soon as one shows there is no session. */
async function fetchAll(tracked: TrackedChannel[]): Promise<BatchOutcome[] | null> {
  const batches: BatchOutcome[] = [];
  const ids = tracked.map((c) => c.broadcasterUserId);
  for (const batchIds of chunk(ids, MAX_USERS_PER_LIVESTREAM_REQUEST)) {
    const outcome = await fetchBatch(batchIds);
    if (outcome === null) return null;
    batches.push(outcome);
  }
  return batches;
}

/**
 * Shows the alerts a poll calls for, and the sound once if any was shown.
 * A stream that starts during quiet hours is already recorded as notified,
 * so no alert for it piles up for when they end.
 */
async function alertAbout(
  tracked: TrackedChannel[],
  changes: { wentLive: number[]; switchedCategory: number[] },
  status: LiveStatusCache,
  now: number
): Promise<void> {
  const settings = await getSettings();
  if (!settings.notificationsEnabled || isQuietTime(settings.quietHours, new Date(now))) return;
  let shown = await notifyChannels('live', channelsToNotify(tracked, changes.wentLive), status);
  if (settings.notifyCategoryChange) {
    shown += await notifyChannels('switched', channelsToNotify(tracked, changes.switchedCategory), status);
  }
  // A sound that can't play (offscreen API missing, autoplay refused) must
  // not fail the poll.
  if (settings.soundEnabled && shown > 0) await playAlertSound().catch(() => {});
}

async function runPoll(): Promise<void> {
  // While Kick has asked us to back off, keep showing what we last knew.
  if (Date.now() < (await pollPausedUntilStorage.getValue())) return;

  const tracked = await getTracked();
  const batches = tracked.length > 0 ? await fetchAll(tracked) : [];
  if (batches === null || batches.length === 0) {
    // Nothing tracked, or no session: an empty badge rather than stale
    // counts, and no point asking Kick.
    await browser.action.setBadgeText({ text: '' });
    return;
  }

  const now = Date.now();
  await pauseIfRateLimited(batches, now);
  const previous = await liveStatusStorage.getValue();
  const { next, wentLive, switchedCategory } = computeNextStatus(previous, batches, now);

  // Saved before notifying: if the worker is stopped in between, the next
  // poll sees these streams as already notified instead of notifying twice.
  await liveStatusStorage.setValue(next);
  await showOnBadge(next);

  await alertAbout(tracked, { wentLive, switchedCategory }, next, now);
}

let inFlightPoll: Promise<void> | null = null;

/**
 * Asks Kick which tracked channels are live, updates the stored status and
 * the badge, and notifies for new streams. Calls made while a poll is running
 * share it instead of starting a second, interleaved one.
 */
export function pollNow(): Promise<void> {
  inFlightPoll ??= runPoll().finally(() => {
    inFlightPoll = null;
  });
  return inFlightPoll;
}

/** Drops status for channels no longer tracked and updates the badge, without asking Kick. */
export async function syncToTracked(tracked: TrackedChannel[]): Promise<void> {
  const ids = new Set(tracked.map((c) => c.broadcasterUserId));
  const current = await liveStatusStorage.getValue();
  const kept = Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(Number(id))));
  await liveStatusStorage.setValue(kept);
  await showOnBadge(kept);
}

/** Forgets what was cached for the logged-out account: live status, badge and profile picture. */
export async function forgetSessionData(): Promise<void> {
  await liveStatusStorage.setValue({});
  await profileStorage.setValue(null);
  await browser.action.setBadgeText({ text: '' });
}
