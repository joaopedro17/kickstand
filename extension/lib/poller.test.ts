import { describe, it, expect } from 'vitest';
import { computeNextStatus, channelsToNotify, countLive, isStale, STALE_AFTER_MS } from './poller';
import type { ChannelStatus, LiveStatusCache, TrackedChannel } from './storage';
import type { KickLivestream } from './types';

const NOW = 1_700_000_000_000;
const MORNING = '2026-11-11T10:00:00Z';
const EVENING = '2026-11-11T20:00:00Z';

function stream(userId: number, overrides: Partial<KickLivestream> = {}): KickLivestream {
  return {
    id: `stream-${userId}`,
    broadcaster_user: { id: userId, username: `user${userId}`, profile_picture: `pic-${userId}` },
    channel: { slug: `slug${userId}` },
    title: `title-${userId}`,
    category: { id: 7, name: 'Just Chatting', thumbnail: 'cat.png' },
    thumbnail: `thumb-${userId}`,
    started_at: MORNING,
    viewer_count: 123,
    has_mature_content: false,
    language_code: 'en',
    tags: [],
    ...overrides,
  };
}

function live(startedAt: string | null, notifiedStartedAt: string | null): ChannelStatus {
  return {
    status: {
      kind: 'live',
      startedAt,
      viewerCount: 1,
      title: 'old',
      category: null,
      thumbnail: null,
    },
    notifiedStartedAt,
    avatarUrl: 'old-pic',
    lastCheckedAt: 1,
  };
}

function offline(notifiedStartedAt: string | null, lastLiveAt: number | null = null): ChannelStatus {
  return {
    status: { kind: 'offline', lastLiveAt },
    notifiedStartedAt,
    avatarUrl: 'old-pic',
    lastCheckedAt: 1,
  };
}

function poll(previous: LiveStatusCache, livestreams: KickLivestream[], ids = [1]) {
  return computeNextStatus(previous, [{ ids, livestreams }], NOW);
}

function channel(id: number, muted = false): TrackedChannel {
  return { broadcasterUserId: id, slug: `slug${id}`, addedAt: id, muted };
}

describe('computeNextStatus', () => {
  it('records the details of a live stream', () => {
    const { next } = poll({ 1: offline(null) }, [stream(1)]);

    expect(next[1]).toEqual({
      status: {
        kind: 'live',
        startedAt: MORNING,
        viewerCount: 123,
        title: 'title-1',
        category: { id: 7, name: 'Just Chatting', thumbnail: 'cat.png' },
        thumbnail: 'thumb-1',
      },
      notifiedStartedAt: MORNING,
      avatarUrl: 'pic-1',
      lastCheckedAt: NOW,
    });
  });

  it('records a channel missing from the response as offline, keeping its avatar', () => {
    const { next } = poll({ 1: offline(MORNING) }, []);

    expect(next[1]).toEqual({
      status: { kind: 'offline', lastLiveAt: null },
      notifiedStartedAt: MORNING,
      avatarUrl: 'old-pic',
      lastCheckedAt: NOW,
    });
  });

  it('gives a never-polled offline channel an empty offline entry', () => {
    const { next } = poll({}, []);

    expect(next[1]).toEqual({
      status: { kind: 'offline', lastLiveAt: null },
      notifiedStartedAt: null,
      avatarUrl: null,
      lastCheckedAt: NOW,
    });
  });

  it('remembers when a channel stopped being live', () => {
    const { next } = poll({ 1: live(MORNING, MORNING) }, []);

    expect(next[1].status).toEqual({ kind: 'offline', lastLiveAt: NOW });
  });

  it('keeps the time a channel was last live while it stays offline', () => {
    const { next } = poll({ 1: offline(MORNING, 42) }, []);

    expect(next[1].status).toEqual({ kind: 'offline', lastLiveAt: 42 });
  });

  it('keeps the previous state of a batch that failed and records the error', () => {
    const previous = { 1: live(MORNING, MORNING) };

    const { next, wentLive } = computeNextStatus(
      previous,
      [{ ids: [1], error: 'Rate limited' }],
      NOW
    );

    expect(next[1]).toEqual({ ...previous[1], lastError: 'Rate limited', lastCheckedAt: NOW });
    expect(wentLive).toEqual([]);
  });

  it('leaves a never-polled channel unpolled when its batch failed', () => {
    const { next } = computeNextStatus({}, [{ ids: [1], error: 'boom' }], NOW);

    expect(next).toEqual({});
  });

  it('handles each batch independently', () => {
    const { next } = computeNextStatus(
      { 2: offline(null) },
      [
        { ids: [1], livestreams: [stream(1)] },
        { ids: [2], error: 'boom' },
      ],
      NOW
    );

    expect(next[1].status.kind).toBe('live');
    expect(next[2].lastError).toBe('boom');
  });

  it('drops channels that are no longer polled', () => {
    const { next } = poll({ 1: offline(null), 99: live(MORNING, MORNING) }, []);

    expect(Object.keys(next)).toEqual(['1']);
  });
});

describe('who to notify', () => {
  it('notifies when a known channel starts a stream', () => {
    expect(poll({ 1: offline(null) }, [stream(1)]).wentLive).toEqual([1]);
  });

  it('does not notify for a stream already running when the channel is first polled', () => {
    const { next, wentLive } = poll({}, [stream(1)]);

    expect(wentLive).toEqual([]);
    expect(next[1].notifiedStartedAt).toBe(MORNING);
  });

  it('does not notify twice for the same stream', () => {
    expect(poll({ 1: live(MORNING, MORNING) }, [stream(1)]).wentLive).toEqual([]);
  });

  it('does not notify again when the same stream comes back after a short drop', () => {
    expect(poll({ 1: offline(MORNING) }, [stream(1, { started_at: MORNING })]).wentLive).toEqual([]);
  });

  it('notifies for a new stream after the previous one ended', () => {
    const { next, wentLive } = poll({ 1: offline(MORNING) }, [stream(1, { started_at: EVENING })]);

    expect(wentLive).toEqual([1]);
    expect(next[1].notifiedStartedAt).toBe(EVENING);
  });

  it('notifies for a new stream even if no offline poll was seen in between', () => {
    expect(poll({ 1: live(MORNING, MORNING) }, [stream(1, { started_at: EVENING })]).wentLive).toEqual([1]);
  });

  describe('when Kick sends no start time', () => {
    const noStart = { started_at: null as unknown as string };

    it('notifies on going from offline to live', () => {
      expect(poll({ 1: offline(MORNING) }, [stream(1, noStart)]).wentLive).toEqual([1]);
    });

    it('does not notify while the channel stays live', () => {
      expect(poll({ 1: live(null, MORNING) }, [stream(1, noStart)]).wentLive).toEqual([]);
    });

    it('keeps the start time it last notified for', () => {
      expect(poll({ 1: offline(MORNING) }, [stream(1, noStart)]).next[1].notifiedStartedAt).toBe(
        MORNING
      );
    });
  });
});

describe('channelsToNotify', () => {
  it('returns the tracked channels that went live, in tracked order', () => {
    expect(channelsToNotify([channel(1), channel(2), channel(3)], [3, 1])).toEqual([
      channel(1),
      channel(3),
    ]);
  });

  it('skips a muted channel', () => {
    expect(channelsToNotify([channel(1, true)], [1])).toEqual([]);
  });
});

describe('countLive', () => {
  it('counts the channels that are live', () => {
    expect(countLive({ 1: live(MORNING, MORNING), 2: offline(null), 3: live(EVENING, EVENING) })).toBe(2);
  });

  it('is zero for an empty cache', () => {
    expect(countLive({})).toBe(0);
  });
});

describe('isStale', () => {
  const at = (lastCheckedAt: number): ChannelStatus => ({ ...offline(null), lastCheckedAt });

  it('is fresh at exactly the limit and stale just after it', () => {
    expect(isStale([channel(1)], { 1: at(NOW - STALE_AFTER_MS) }, NOW)).toBe(false);
    expect(isStale([channel(1)], { 1: at(NOW - STALE_AFTER_MS - 1) }, NOW)).toBe(true);
  });

  it('goes by the most recent check', () => {
    expect(isStale([channel(1), channel(2)], { 1: at(0), 2: at(NOW - 1000) }, NOW)).toBe(false);
  });

  it('is stale when a tracked channel was never polled', () => {
    expect(isStale([channel(1), channel(2)], { 1: at(NOW) }, NOW)).toBe(true);
  });

  it('is never stale with nothing tracked', () => {
    expect(isStale([], {}, NOW)).toBe(false);
  });
});
