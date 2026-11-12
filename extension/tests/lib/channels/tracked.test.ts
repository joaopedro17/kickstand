import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getTracked,
  setTracked,
  addChannels,
  removeTracked,
  toggleMuted,
  watchTracked,
  TrackedListFullError,
  MAX_TRACKED,
  isStorageFullError,
  type TrackedChannel,
} from '@/lib/channels/tracked';
import type { Channel } from '@/lib/kick/types';

/** The per-item limit of chrome.storage.sync (QUOTA_BYTES_PER_ITEM), key included. */
const SYNC_ITEM_LIMIT = 8192;

function channel(id: number, slug = `slug${id}`): TrackedChannel {
  return { broadcasterUserId: id, slug, addedAt: 1_700_000_000_000 + id, muted: false };
}

function channels(count: number): TrackedChannel[] {
  return Array.from({ length: count }, (_, i) => channel(i + 1));
}

const NOW = 1_800_000_000_000;

function found(id: number, slug = `slug${id}`): Channel {
  return { broadcasterUserId: id, slug };
}

function trackedAt(id: number, slug = `slug${id}`): TrackedChannel {
  return { broadcasterUserId: id, slug, addedAt: NOW, muted: false };
}

async function syncContents(): Promise<Record<string, unknown>> {
  return fakeBrowser.storage.sync.get(null);
}

describe('tracked channels storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('is empty for a new user, without writing anything', async () => {
    expect(await getTracked()).toEqual([]);
    expect(await syncContents()).toEqual({});
  });

  it.each([1, 50, 51, 120, MAX_TRACKED])('keeps %i channels in order', async (count) => {
    await setTracked(channels(count));

    expect(await getTracked()).toEqual(channels(count));
  });

  it('keeps every stored item under the sync per-item limit at the maximum list size', async () => {
    const worstCase = Array.from({ length: MAX_TRACKED }, (_, i) => ({
      broadcasterUserId: 999_999_999 - i,
      slug: 'x'.repeat(25),
      addedAt: 9_999_999_999_999,
      muted: false,
    }));

    await setTracked(worstCase);

    for (const [key, value] of Object.entries(await syncContents())) {
      expect(key.length + JSON.stringify(value).length).toBeLessThan(SYNC_ITEM_LIMIT);
    }
    expect(await getTracked()).toEqual(worstCase);
  });

  it('removes the items a shorter list no longer needs', async () => {
    await setTracked(channels(120));
    const keysBefore = Object.keys(await syncContents()).length;

    await setTracked(channels(10));

    expect(Object.keys(await syncContents()).length).toBeLessThan(keysBefore);
    expect(await getTracked()).toEqual(channels(10));
  });

  it('refuses a list over the maximum and leaves the stored one alone', async () => {
    await setTracked(channels(3));

    await expect(setTracked(channels(MAX_TRACKED + 1))).rejects.toBeInstanceOf(TrackedListFullError);
    expect(await getTracked()).toEqual(channels(3));
  });

  describe('upgrading from the single-item list of earlier versions', () => {
    it('carries the old list over and removes the old item', async () => {
      await fakeBrowser.storage.sync.set({ trackedChannels: channels(3) });

      expect(await getTracked()).toEqual(channels(3));
      expect(await syncContents()).not.toHaveProperty('trackedChannels');
      expect(await getTracked()).toEqual(channels(3));
    });

    it('ignores a leftover old item once the new format exists', async () => {
      await setTracked(channels(2));
      await fakeBrowser.storage.sync.set({ trackedChannels: channels(9) });

      expect(await getTracked()).toEqual(channels(2));
    });
  });

  describe('changes', () => {
    it('adds channels at the end, unmuted, stamped with the time they were added', async () => {
      await setTracked([channel(1)]);

      expect(await addChannels([found(2), found(3)], NOW)).toEqual({
        added: [found(2), found(3)],
        alreadyTracked: [],
      });
      expect(await getTracked()).toEqual([channel(1), trackedAt(2), trackedAt(3)]);
    });

    it('leaves a tracked channel as it is and says it was already tracked', async () => {
      await setTracked([{ ...channel(1, 'first-slug'), muted: true }]);

      expect(await addChannels([found(1, 'renamed'), found(2)], NOW)).toEqual({
        added: [found(2)],
        alreadyTracked: [found(1, 'renamed')],
      });
      expect(await getTracked()).toEqual([{ ...channel(1, 'first-slug'), muted: true }, trackedAt(2)]);
    });

    it('adds a channel named twice in one batch once', async () => {
      expect(await addChannels([found(1), found(1, 'again')], NOW)).toEqual({
        added: [found(1)],
        alreadyTracked: [found(1, 'again')],
      });
      expect(await getTracked()).toEqual([trackedAt(1)]);
    });

    it('writes nothing when every channel is already tracked', async () => {
      await setTracked([channel(1)]);
      const seen: TrackedChannel[][] = [];
      const unwatch = watchTracked((list) => seen.push(list));

      await addChannels([found(1)], NOW);
      await new Promise((resolve) => setTimeout(resolve, 10));
      unwatch();

      expect(seen).toEqual([]);
    });

    it('adds nothing from a batch that would go over the maximum', async () => {
      await setTracked(channels(MAX_TRACKED - 1));

      await expect(addChannels([found(MAX_TRACKED), found(MAX_TRACKED + 1)], NOW)).rejects.toBeInstanceOf(
        TrackedListFullError
      );
      expect(await getTracked()).toHaveLength(MAX_TRACKED - 1);
    });

    it('keeps both of two adds made at the same time', async () => {
      await Promise.all([addChannels([found(1)], NOW), addChannels([found(2)], NOW)]);

      expect(await getTracked()).toEqual([trackedAt(1), trackedAt(2)]);
    });

    it('removes a channel', async () => {
      await setTracked(channels(3));

      await removeTracked(2);

      expect(await getTracked()).toEqual([channel(1), channel(3)]);
    });

    it('mutes and unmutes a channel', async () => {
      await setTracked(channels(2));

      await toggleMuted(2);
      expect((await getTracked()).map((c) => c.muted)).toEqual([false, true]);

      await toggleMuted(2);
      expect((await getTracked()).map((c) => c.muted)).toEqual([false, false]);
    });
  });

  it('tells watchers the new list after a change', async () => {
    const seen: TrackedChannel[][] = [];
    const unwatch = watchTracked((list) => seen.push(list));

    await addChannels([found(1)], NOW);
    await expect.poll(() => seen.at(-1)).toEqual([trackedAt(1)]);

    unwatch();
    await addChannels([found(2)], NOW);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen.at(-1)).toEqual([trackedAt(1)]);
  });
});

describe('isStorageFullError', () => {
  it.each([
    'QUOTA_BYTES quota exceeded',
    'QUOTA_BYTES_PER_ITEM quota exceeded',
    'MAX_ITEMS quota exceeded',
    'QuotaExceededError: storage.sync API call exceeded its quota limitations.',
  ])('recognises "%s"', (message) => {
    expect(isStorageFullError(new Error(message))).toBe(true);
  });

  it.each([new Error('Network request failed'), 'QUOTA as a bare string', null])(
    'does not treat %j as a full storage',
    (err) => {
      expect(isStorageFullError(err)).toBe(false);
    }
  );
});
