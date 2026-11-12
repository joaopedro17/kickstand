import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getHidden,
  hideCategory,
  hideChannel,
  isShown,
  showCategory,
  showChannel,
  watchHidden,
  type HiddenFromBrowse,
} from '@/lib/browse-hidden';
import type { Livestream } from '@/lib/kick/types';

function stream(userId: number, categoryId: number | null): Livestream {
  return {
    id: `s${userId}`,
    broadcaster: { id: userId, username: `user${userId}`, profilePicture: null },
    slug: `slug${userId}`,
    title: '',
    category: categoryId === null ? null : { id: categoryId, name: `cat${categoryId}` },
    thumbnail: null,
    startedAt: null,
    viewerCount: 0,
    hasMatureContent: false,
    languageCode: 'en',
  };
}

describe('hidden from Browse', () => {
  beforeEach(() => fakeBrowser.reset());

  it('starts with nothing hidden', async () => {
    expect(await getHidden()).toEqual({ channels: [], categories: [] });
  });

  it('hides channels and categories once each, and shows them again', async () => {
    await Promise.all([
      hideChannel({ id: 1, slug: 'one' }),
      hideChannel({ id: 1, slug: 'one' }),
      hideCategory({ id: 9, name: 'Slots' }),
      hideChannel({ id: 2, slug: 'two' }),
    ]);
    expect(await getHidden()).toEqual({
      channels: [
        { id: 1, slug: 'one' },
        { id: 2, slug: 'two' },
      ],
      categories: [{ id: 9, name: 'Slots' }],
    });

    await showChannel(1);
    await showCategory(9);

    expect(await getHidden()).toEqual({ channels: [{ id: 2, slug: 'two' }], categories: [] });
  });

  it('tells a watcher about each change', async () => {
    const seen: HiddenFromBrowse[] = [];
    const unwatch = watchHidden((hidden) => seen.push(hidden));

    await hideChannel({ id: 1, slug: 'one' });
    await expect.poll(() => seen.length).toBe(1);
    unwatch();

    expect(seen[0].channels).toEqual([{ id: 1, slug: 'one' }]);
  });
});

describe('isShown', () => {
  const hidden: HiddenFromBrowse = { channels: [{ id: 1, slug: 'one' }], categories: [{ id: 9, name: 'Slots' }] };

  it('hides a hidden channel and every stream in a hidden category', () => {
    expect(isShown(stream(1, 7), hidden)).toBe(false);
    expect(isShown(stream(2, 9), hidden)).toBe(false);
  });

  it('shows everything else, including streams with no category', () => {
    expect(isShown(stream(2, 7), hidden)).toBe(true);
    expect(isShown(stream(3, null), hidden)).toBe(true);
  });
});
