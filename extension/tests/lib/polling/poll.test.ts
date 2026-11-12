import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  pollNow,
  ensurePollAlarm,
  syncToTracked,
  openNotifiedChannel,
  POLL_ALARM,
} from '@/lib/polling/poll';
import { authTokensStorage } from '@/lib/auth/storage';
import { liveStatusStorage } from '@/lib/polling/storage';
import type { ChannelStatus } from '@/lib/polling/live-status';
import { type TrackedChannel, setTracked } from '@/lib/channels/tracked';
import { updateSettings } from '@/lib/settings';

const STARTED = '2026-11-11T10:00:00Z';

function tracked(id: number, muted = false): TrackedChannel {
  return { broadcasterUserId: id, slug: `slug${id}`, addedAt: id, muted };
}

function livestream(id: number, startedAt = STARTED) {
  return {
    id: `s${id}`,
    broadcaster_user: { id, username: `User${id}`, profile_picture: `https://pic/${id}` },
    channel: { slug: `slug${id}` },
    title: `Stream ${id}`,
    category: { id: 1, name: 'Just Chatting', thumbnail: '' },
    thumbnail: `https://thumb/${id}`,
    started_at: startedAt,
    viewer_count: 1234,
    has_mature_content: false,
    language_code: 'en',
    tags: [],
  };
}

function offline(): ChannelStatus {
  return {
    status: { kind: 'offline', lastLiveAt: null },
    notifiedStartedAt: null,
    avatarUrl: null,
    lastCheckedAt: 1,
  };
}

function live(): ChannelStatus {
  return {
    status: {
      kind: 'live',
      broadcasterName: '',
      startedAt: STARTED,
      viewerCount: 5,
      title: 't',
      category: null,
      thumbnail: null,
    },
    notifiedStartedAt: STARTED,
    avatarUrl: null,
    lastCheckedAt: 1,
  };
}

/** Kick answers every livestream request with these streams. */
function kickHasLive(...streams: Record<string, unknown>[]) {
  const fetchMock = vi.fn().mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: streams }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Tokens valid for an hour from the (possibly faked) current time. */
async function logIn() {
  await authTokensStorage.setValue({
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 60 * 60 * 1000,
    refreshExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
}

async function badge() {
  return fakeBrowser.action.getBadgeText({});
}

async function notifications() {
  return Object.keys(await fakeBrowser.notifications.getAll());
}

describe('pollNow', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await authTokensStorage.setValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      refreshExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('shows how many tracked channels are live on the badge', async () => {
    await setTracked([tracked(1), tracked(2), tracked(3)]);
    kickHasLive(livestream(1), livestream(3));

    await pollNow();

    expect(await badge()).toBe('2');
  });

  it('clears the badge when nobody is live', async () => {
    await setTracked([tracked(1)]);
    await fakeBrowser.action.setBadgeText({ text: '4' });
    kickHasLive();

    await pollNow();

    expect(await badge()).toBe('');
  });

  it('notifies when a known channel starts streaming, with its avatar and title', async () => {
    await setTracked([tracked(1)]);
    await liveStatusStorage.setValue({ 1: offline() });
    kickHasLive(livestream(1));

    await pollNow();

    const all = await fakeBrowser.notifications.getAll();
    expect(all['kickstand-live-1']).toMatchObject({
      iconUrl: 'https://pic/1',
      title: 'User1 is live!',
      message: 'Stream 1',
      contextMessage: 'Just Chatting · 1,234 viewers',
    });
  });

  it('names the channel by its slug when Kick gives no display name, and leaves out a missing category', async () => {
    await setTracked([tracked(1)]);
    await liveStatusStorage.setValue({ 1: offline() });
    const bare = { ...livestream(1), category: null };
    bare.broadcaster_user = { ...bare.broadcaster_user, username: '' };
    kickHasLive(bare);

    await pollNow();

    const all = await fakeBrowser.notifications.getAll();
    expect(all['kickstand-live-1']).toMatchObject({
      title: 'slug1 is live!',
      contextMessage: '1,234 viewers',
    });
  });

  it('puts the category and viewers in the message on Firefox, which ignores contextMessage', async () => {
    vi.stubEnv('FIREFOX', 'true');
    await setTracked([tracked(1)]);
    await liveStatusStorage.setValue({ 1: offline() });
    kickHasLive(livestream(1));

    await pollNow();

    const notification = (await fakeBrowser.notifications.getAll())['kickstand-live-1'];
    expect(notification.message).toBe('Stream 1\nJust Chatting · 1,234 viewers');
    expect(notification).not.toHaveProperty('contextMessage');
  });

  it('falls back to the Kickstand icon and a stock message when the stream has no avatar or title', async () => {
    await setTracked([tracked(1)]);
    await liveStatusStorage.setValue({ 1: offline() });
    const bare = { ...livestream(1), title: '' };
    bare.broadcaster_user = { ...bare.broadcaster_user, profile_picture: '' };
    kickHasLive(bare);

    await pollNow();

    const all = await fakeBrowser.notifications.getAll();
    expect(all['kickstand-live-1']).toMatchObject({
      iconUrl: expect.stringMatching(/\/icons\/128\.png$/),
      message: 'Streaming now on Kick',
    });
  });

  it('stays silent during quiet hours, still updating the badge, and does not catch up afterwards', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 10, 11, 23, 30));
      await logIn();
      await updateSettings({ quietHours: { enabled: true, startMinute: 22 * 60, endMinute: 7 * 60 } });
      await setTracked([tracked(1)]);
      await liveStatusStorage.setValue({ 1: offline() });
      kickHasLive(livestream(1));

      await pollNow();
      expect(await notifications()).toEqual([]);
      expect(await badge()).toBe('1');

      vi.setSystemTime(new Date(2026, 10, 12, 8, 0));
      await logIn();
      await pollNow();
      expect(await notifications()).toEqual([]);
      expect(await badge()).toBe('1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('notifies outside quiet hours', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 10, 11, 21, 59));
      await logIn();
      await updateSettings({ quietHours: { enabled: true, startMinute: 22 * 60, endMinute: 7 * 60 } });
      await setTracked([tracked(1)]);
      await liveStatusStorage.setValue({ 1: offline() });
      kickHasLive(livestream(1));

      await pollNow();

      expect(await notifications()).toEqual(['kickstand-live-1']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not notify for a muted channel, but still counts it on the badge', async () => {
    await setTracked([tracked(1, true)]);
    await liveStatusStorage.setValue({ 1: offline() });
    kickHasLive(livestream(1));

    await pollNow();

    expect(await notifications()).toEqual([]);
    expect(await badge()).toBe('1');
  });

  it('does not notify when notifications are turned off', async () => {
    await updateSettings({ notificationsEnabled: false });
    await setTracked([tracked(1)]);
    await liveStatusStorage.setValue({ 1: offline() });
    kickHasLive(livestream(1));

    await pollNow();

    expect(await notifications()).toEqual([]);
  });

  it('saves the new status before notifying, so a stopped worker cannot notify twice', async () => {
    await setTracked([tracked(1)]);
    await liveStatusStorage.setValue({ 1: offline() });
    kickHasLive(livestream(1));
    let savedWhenNotified: unknown;
    vi.spyOn(fakeBrowser.notifications, 'create').mockImplementation(async () => {
      savedWhenNotified = (await liveStatusStorage.getValue())[1]?.notifiedStartedAt;
      return '';
    });

    await pollNow();

    expect(savedWhenNotified).toBe(STARTED);
  });

  it('runs one poll at a time: a second request while one is running shares it', async () => {
    await setTracked([tracked(1)]);
    const fetchMock = kickHasLive();

    await Promise.all([pollNow(), pollNow(), pollNow()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the badge and stops when logged out', async () => {
    await authTokensStorage.setValue(null);
    await setTracked([tracked(1)]);
    await fakeBrowser.action.setBadgeText({ text: '1' });
    const fetchMock = kickHasLive(livestream(1));

    await pollNow();

    expect(await badge()).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the badge without asking Kick when nothing is tracked', async () => {
    await fakeBrowser.action.setBadgeText({ text: '1' });
    const fetchMock = kickHasLive();

    await pollNow();

    expect(await badge()).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks Kick about at most 100 channels per request', async () => {
    await setTracked(Array.from({ length: 150 }, (_, i) => tracked(i + 1)));
    const fetchMock = kickHasLive();

    await pollNow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous status of a batch that failed, with the error', async () => {
    await setTracked([tracked(1)]);
    await liveStatusStorage.setValue({ 1: live() });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await pollNow();

    expect((await liveStatusStorage.getValue())[1]).toMatchObject({
      status: { kind: 'live' },
      lastError: 'Network request failed',
    });
  });
});

describe('when Kick rate-limits', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-11-11T12:00:00Z'));
    await authTokensStorage.setValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      refreshExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    await setTracked([tracked(1)]);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function kickRateLimits(retryAfter?: string) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers(retryAfter ? { 'Retry-After': retryAfter } : {}),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('does not poll again until the wait Kick asked for has passed', async () => {
    const fetchMock = kickRateLimits('120');
    await pollNow();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 119_000);
    await pollNow();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 2_000);
    await pollNow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('waits a minute when Kick does not say how long', async () => {
    const fetchMock = kickRateLimits();
    await pollNow();

    vi.setSystemTime(Date.now() + 59_000);
    await pollNow();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 2_000);
    await pollNow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('slows polling to every five minutes, and goes back to the chosen interval after a good poll', async () => {
    await updateSettings({ pollIntervalMinutes: 1 });
    const period = async () => (await fakeBrowser.alarms.get(POLL_ALARM))?.periodInMinutes;
    kickRateLimits('30');

    await pollNow();
    expect(await period()).toBe(5);

    vi.setSystemTime(Date.now() + 31_000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) })
    );
    await pollNow();
    expect(await period()).toBe(1);
  });

  it('keeps showing the last known status while waiting', async () => {
    await liveStatusStorage.setValue({ 1: live() });
    await fakeBrowser.action.setBadgeText({ text: '1' });
    kickRateLimits('120');

    await pollNow();
    await pollNow();

    expect(await badge()).toBe('1');
    expect((await liveStatusStorage.getValue())[1].status.kind).toBe('live');
  });
});

describe('syncToTracked', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('drops status for channels no longer tracked and updates the badge right away', async () => {
    await liveStatusStorage.setValue({ 1: live(), 2: live() });
    await fakeBrowser.action.setBadgeText({ text: '2' });

    await syncToTracked([tracked(1)]);

    expect(Object.keys(await liveStatusStorage.getValue())).toEqual(['1']);
    expect(await badge()).toBe('1');
  });
});

describe('ensurePollAlarm', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  const period = async () => (await fakeBrowser.alarms.get(POLL_ALARM))?.periodInMinutes;

  it('creates the poll alarm at the default two minutes when it is missing', async () => {
    await ensurePollAlarm();

    expect(await period()).toBe(2);
  });

  it('uses the interval the user picked', async () => {
    await updateSettings({ pollIntervalMinutes: 1 });

    await ensurePollAlarm();

    expect(await period()).toBe(1);
  });

  it('leaves an alarm with the right period alone, so its next run is not pushed back', async () => {
    await fakeBrowser.alarms.create(POLL_ALARM, { periodInMinutes: 2, when: 12345 });

    await ensurePollAlarm();

    expect((await fakeBrowser.alarms.get(POLL_ALARM))?.scheduledTime).toBe(12345);
  });

  it('replaces an alarm whose period is no longer the one wanted', async () => {
    await fakeBrowser.alarms.create(POLL_ALARM, { periodInMinutes: 5 });
    await updateSettings({ pollIntervalMinutes: 1 });

    await ensurePollAlarm();

    expect(await period()).toBe(1);
  });
});

describe('openNotifiedChannel', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the channel on kick.com and clears the notification', async () => {
    await setTracked([tracked(7)]);
    await fakeBrowser.notifications.create('kickstand-live-7', {
      type: 'basic',
      iconUrl: '',
      title: '',
      message: '',
    });
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);

    await openNotifiedChannel('kickstand-live-7');

    expect(create).toHaveBeenCalledWith({ url: 'https://kick.com/slug7' });
    expect(await notifications()).toEqual([]);
  });

  it('ignores notifications that are not Kickstand live alerts', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);

    await openNotifiedChannel('something-else');

    expect(create).not.toHaveBeenCalled();
  });

  it('opens nothing for a channel that was untracked since', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);

    await openNotifiedChannel('kickstand-live-7');

    expect(create).not.toHaveBeenCalled();
  });
});
