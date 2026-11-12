import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import background from '@/entrypoints/background';
import { POLL_ALARM } from '@/lib/polling/poll';
import { authTokensStorage, profileStorage } from '@/lib/auth/storage';
import { liveStatusStorage } from '@/lib/polling/storage';
import type { ChannelStatus } from '@/lib/polling/live-status';
import { setTracked, removeTracked } from '@/lib/channels/tracked';
import * as session from '@/lib/auth/session';

function kickHasLive(...ids: number[]) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      String(url).includes('/users/livestreams')
        ? {
            data: ids.map((id) => ({
              id: `s${id}`,
              broadcaster_user: { id, username: `u${id}`, profile_picture: '' },
              channel: { slug: `slug${id}` },
              title: '',
              category: null,
              thumbnail: '',
              started_at: '2026-11-11T10:00:00Z',
              viewer_count: 1,
              has_mature_content: false,
              language_code: 'en',
              tags: [],
            })),
          }
        : { data: [] },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function live(): ChannelStatus {
  return {
    status: { kind: 'live', startedAt: null, viewerCount: 1, title: '', category: null, thumbnail: null },
    notifiedStartedAt: null,
    avatarUrl: null,
    lastCheckedAt: 1,
  };
}

const badge = () => fakeBrowser.action.getBadgeText({});

async function startWorker() {
  background.main();
  // Let start-up work scheduled by main() settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('background', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await authTokensStorage.setValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      refreshExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    await setTracked([
      { broadcasterUserId: 1, slug: 'slug1', addedAt: 1, muted: false },
      { broadcasterUserId: 2, slug: 'slug2', addedAt: 2, muted: false },
    ]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('makes sure the poll alarm exists whenever the worker starts', async () => {
    kickHasLive();
    await startWorker();

    expect(await fakeBrowser.alarms.get(POLL_ALARM)).toBeDefined();
  });

  it('polls right away when installed or updated, instead of waiting for the alarm', async () => {
    kickHasLive(1, 2);
    await startWorker();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', temporary: false });

    await expect.poll(badge).toBe('2');
  });

  it('drops the live-status cache of earlier versions on update', async () => {
    kickHasLive();
    await fakeBrowser.storage.local.set({ liveStatus: { 1: { isLive: true } } });
    await startWorker();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', temporary: false });

    await expect
      .poll(async () => fakeBrowser.storage.local.get('liveStatus'))
      .toEqual({});
  });

  it('polls right away when the browser starts', async () => {
    kickHasLive(1);
    await startWorker();

    await fakeBrowser.runtime.onStartup.trigger();

    await expect.poll(badge).toBe('1');
  });

  it('polls when the poll alarm fires', async () => {
    kickHasLive(2);
    await startWorker();

    await fakeBrowser.alarms.onAlarm.trigger({ name: POLL_ALARM, scheduledTime: Date.now() });

    await expect.poll(badge).toBe('1');
  });

  it('updates the badge as soon as a live channel is untracked, without asking Kick', async () => {
    const fetchMock = kickHasLive();
    await liveStatusStorage.setValue({ 1: live(), 2: live() });
    await startWorker();
    fetchMock.mockClear();

    await removeTracked(2);

    await expect.poll(badge).toBe('1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('polls right after a successful login', async () => {
    kickHasLive(1, 2);
    vi.spyOn(session, 'startLoginFlow').mockResolvedValue({} as never);
    await startWorker();

    // The fake's trigger is typed without sendResponse; the real listener takes it.
    const trigger = fakeBrowser.runtime.onMessage.trigger as (...args: unknown[]) => unknown;
    const reply = await new Promise((resolve) => trigger({ type: 'login' }, {}, resolve));

    expect(reply).toEqual({ ok: true, value: { success: true } });
    await expect.poll(badge).toBe('2');
  });

  it.each([
    [new session.AuthError('cancelled', 'Login was cancelled'), { success: false, error: 'cancelled' }],
    [new Error('boom'), { success: false, error: 'unknown' }],
  ])('reports a failed login to the popup without polling', async (thrown, expected) => {
    const fetchMock = kickHasLive(1);
    vi.spyOn(session, 'startLoginFlow').mockRejectedValue(thrown);
    await startWorker();
    fetchMock.mockClear();

    const trigger = fakeBrowser.runtime.onMessage.trigger as (...args: unknown[]) => unknown;
    const reply = await new Promise((resolve) => trigger({ type: 'login' }, {}, resolve));

    expect(reply).toEqual({ ok: true, value: expect.objectContaining(expected) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forgets live status, the badge and the profile picture on logout', async () => {
    kickHasLive();
    await liveStatusStorage.setValue({ 1: live() });
    await profileStorage.setValue({ avatarUrl: 'https://me.png', fetchedAt: Date.now() });
    await fakeBrowser.action.setBadgeText({ text: '1' });
    await startWorker();

    const trigger = fakeBrowser.runtime.onMessage.trigger as (...args: unknown[]) => unknown;
    await new Promise((resolve) => trigger({ type: 'logout' }, {}, resolve));

    expect(await authTokensStorage.getValue()).toBeNull();
    expect(await liveStatusStorage.getValue()).toEqual({});
    expect(await profileStorage.getValue()).toBeNull();
    expect(await badge()).toBe('');
  });

  it("forgets the previous account's profile picture when someone logs in", async () => {
    kickHasLive();
    await profileStorage.setValue({ avatarUrl: 'https://previous.png', fetchedAt: Date.now() });
    vi.spyOn(session, 'startLoginFlow').mockResolvedValue({} as never);
    await startWorker();

    const trigger = fakeBrowser.runtime.onMessage.trigger as (...args: unknown[]) => unknown;
    await new Promise((resolve) => trigger({ type: 'login' }, {}, resolve));

    expect(await profileStorage.getValue()).toBeNull();
  });
});
