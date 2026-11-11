import { describe, it, expect } from 'vitest';
import { computeNextStatus, channelsToNotify, countLive } from './poller';
import type { LiveStatusCache, LiveStatusEntry, TrackedChannel } from './storage';
import type { KickLivestream } from './types';

const NOW = 1_700_000_000_000;

function stream(userId: number, overrides: Partial<KickLivestream> = {}): KickLivestream {
  return {
    id: `stream-${userId}`,
    broadcaster_user: { id: userId, username: `user${userId}`, profile_picture: `pic-${userId}` },
    channel: { slug: `slug${userId}` },
    title: `title-${userId}`,
    category: { id: 7, name: 'Just Chatting', thumbnail: 'cat.png' },
    thumbnail: `thumb-${userId}`,
    started_at: '2026-11-11T10:00:00Z',
    viewer_count: 123,
    has_mature_content: false,
    language_code: 'en',
    tags: [],
    ...overrides,
  };
}

function entry(overrides: Partial<LiveStatusEntry> = {}): LiveStatusEntry {
  return {
    isLive: false,
    viewerCount: 0,
    category: null,
    thumbnail: null,
    title: '',
    avatarUrl: null,
    lastCheckedAt: 1,
    ...overrides,
  };
}

function channel(id: number, muted = false): TrackedChannel {
  return { broadcasterUserId: id, slug: `slug${id}`, addedAt: id, muted };
}

describe('computeNextStatus', () => {
  it('records the stream details of a channel that is live', () => {
    const next = computeNextStatus({}, [{ ids: [1], livestreams: [stream(1)] }], NOW);

    expect(next[1]).toEqual({
      isLive: true,
      viewerCount: 123,
      category: { id: 7, name: 'Just Chatting', thumbnail: 'cat.png' },
      thumbnail: 'thumb-1',
      title: 'title-1',
      avatarUrl: 'pic-1',
      lastCheckedAt: NOW,
    });
  });

  it('marks a channel missing from the response as offline, keeping its last known details', () => {
    const previous: LiveStatusCache = {
      1: entry({ isLive: true, title: 'old title', avatarUrl: 'old-pic', viewerCount: 50 }),
    };

    const next = computeNextStatus(previous, [{ ids: [1], livestreams: [] }], NOW);

    expect(next[1]).toMatchObject({
      isLive: false,
      title: 'old title',
      avatarUrl: 'old-pic',
      lastCheckedAt: NOW,
    });
  });

  it('gives a never-seen offline channel an empty entry', () => {
    const next = computeNextStatus({}, [{ ids: [1], livestreams: [] }], NOW);

    expect(next[1]).toEqual(entry({ lastCheckedAt: NOW }));
  });

  it('keeps the previous live state of a batch that failed and records the error', () => {
    const previous: LiveStatusCache = { 1: entry({ isLive: true, title: 'still on' }) };

    const next = computeNextStatus(previous, [{ ids: [1, 2], error: 'Rate limited' }], NOW);

    expect(next[1]).toMatchObject({ isLive: true, title: 'still on', lastError: 'Rate limited', lastCheckedAt: NOW });
    expect(next[2]).toMatchObject({ isLive: false, lastError: 'Rate limited' });
  });

  it('handles each batch independently', () => {
    const next = computeNextStatus(
      {},
      [
        { ids: [1], livestreams: [stream(1)] },
        { ids: [2], error: 'boom' },
      ],
      NOW
    );

    expect(next[1].isLive).toBe(true);
    expect(next[2].lastError).toBe('boom');
  });

  it('drops entries for channels that are no longer polled', () => {
    const previous: LiveStatusCache = { 1: entry(), 99: entry({ isLive: true }) };

    const next = computeNextStatus(previous, [{ ids: [1], livestreams: [] }], NOW);

    expect(Object.keys(next)).toEqual(['1']);
  });
});

describe('channelsToNotify', () => {
  it('returns unmuted channels that went from offline to live', () => {
    const tracked = [channel(1), channel(2)];
    const previous: LiveStatusCache = { 1: entry(), 2: entry() };
    const next: LiveStatusCache = { 1: entry({ isLive: true }), 2: entry() };

    expect(channelsToNotify(tracked, previous, next)).toEqual([channel(1)]);
  });

  it('skips a muted channel', () => {
    const tracked = [channel(1, true)];
    const next: LiveStatusCache = { 1: entry({ isLive: true }) };

    expect(channelsToNotify(tracked, { 1: entry() }, next)).toEqual([]);
  });

  it('skips a channel that was already live', () => {
    const tracked = [channel(1)];
    const live: LiveStatusCache = { 1: entry({ isLive: true }) };

    expect(channelsToNotify(tracked, live, live)).toEqual([]);
  });
});

describe('countLive', () => {
  it('counts the channels that are live', () => {
    expect(countLive({ 1: entry({ isLive: true }), 2: entry(), 3: entry({ isLive: true }) })).toBe(2);
  });

  it('is zero for an empty cache', () => {
    expect(countLive({})).toBe(0);
  });
});
