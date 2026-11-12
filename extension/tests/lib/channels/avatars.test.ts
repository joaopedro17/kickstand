import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  AVATAR_MAX_AGE_MS,
  avatarStorage,
  avatarsToRefresh,
  refreshAvatars,
} from '@/lib/channels/avatars';
import type { TrackedChannel } from '@/lib/channels/tracked';

const NOW = 1_800_000_000_000;

function tracked(id: number): TrackedChannel {
  return { broadcasterUserId: id, slug: `slug${id}`, addedAt: id, muted: false };
}

describe('avatarsToRefresh', () => {
  it('picks channels with no picture yet, and pictures older than a week', () => {
    const avatars = {
      1: { url: 'a', fetchedAt: NOW - AVATAR_MAX_AGE_MS },
      2: { url: 'b', fetchedAt: NOW - AVATAR_MAX_AGE_MS - 1 },
      3: { url: null, fetchedAt: NOW - 1000 },
    };

    expect(avatarsToRefresh([tracked(1), tracked(2), tracked(3), tracked(4)], avatars, NOW)).toEqual([2, 4]);
  });
});

describe('refreshAvatars', () => {
  beforeEach(() => fakeBrowser.reset());

  it('fetches the stale pictures, remembers them, and forgets channels no longer tracked', async () => {
    await avatarStorage.setValue({
      1: { url: 'fresh', fetchedAt: NOW },
      9: { url: 'untracked', fetchedAt: NOW },
    });
    const fetchUsers = vi.fn().mockResolvedValue([
      { userId: 2, profilePicture: 'https://pic/2' },
      { userId: 3, profilePicture: null },
    ]);

    await refreshAvatars([tracked(1), tracked(2), tracked(3), tracked(4)], fetchUsers, NOW);

    expect(fetchUsers).toHaveBeenCalledWith([2, 3, 4]);
    expect(await avatarStorage.getValue()).toEqual({
      1: { url: 'fresh', fetchedAt: NOW },
      2: { url: 'https://pic/2', fetchedAt: NOW },
      3: { url: null, fetchedAt: NOW },
      4: { url: null, fetchedAt: NOW },
    });
  });

  it('asks Kick nothing when every picture is fresh', async () => {
    await avatarStorage.setValue({ 1: { url: 'fresh', fetchedAt: NOW } });
    const fetchUsers = vi.fn();

    await refreshAvatars([tracked(1)], fetchUsers, NOW);

    expect(fetchUsers).not.toHaveBeenCalled();
  });

  it('keeps what it had when there is no session', async () => {
    await avatarStorage.setValue({ 1: { url: 'old', fetchedAt: 0 } });

    await refreshAvatars([tracked(1)], vi.fn().mockResolvedValue(null), NOW);

    expect(await avatarStorage.getValue()).toEqual({ 1: { url: 'old', fetchedAt: 0 } });
  });
});
