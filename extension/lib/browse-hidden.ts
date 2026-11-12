import { storage } from 'wxt/utils/storage';
import type { Livestream } from '@/lib/kick/types';
import { serialQueue } from './serial';

/** Channels and categories the user asked Browse not to show; names kept for the list in Settings. */
export interface HiddenFromBrowse {
  channels: { id: number; slug: string }[];
  categories: { id: number; name: string }[];
}

const hiddenStorage = storage.defineItem<HiddenFromBrowse>('local:browseHidden', {
  fallback: { channels: [], categories: [] },
});

export function getHidden(): Promise<HiddenFromBrowse> {
  return hiddenStorage.getValue();
}

export function watchHidden(onChange: (hidden: HiddenFromBrowse) => void): () => void {
  return hiddenStorage.watch(onChange);
}

const enqueue = serialQueue();

function change(edit: (hidden: HiddenFromBrowse) => HiddenFromBrowse): Promise<void> {
  return enqueue(async () => hiddenStorage.setValue(edit(await getHidden())));
}

const without = <T extends { id: number }>(items: T[], id: number) => items.filter((item) => item.id !== id);
/** `items` with `item` at the end, unless one with its id is there already. */
const adding = <T extends { id: number }>(items: T[], item: T) =>
  items.some((i) => i.id === item.id) ? items : [...items, item];

export const hideChannel = (channel: { id: number; slug: string }) =>
  change((h) => ({ ...h, channels: adding(h.channels, channel) }));

export const hideCategory = (category: { id: number; name: string }) =>
  change((h) => ({ ...h, categories: adding(h.categories, category) }));

export const showChannel = (id: number) => change((h) => ({ ...h, channels: without(h.channels, id) }));

export const showCategory = (id: number) => change((h) => ({ ...h, categories: without(h.categories, id) }));

/** Whether Browse shows the stream: neither its channel nor its category is hidden. */
export function isShown(stream: Livestream, hidden: HiddenFromBrowse): boolean {
  const categoryId = stream.category?.id;
  return (
    !hidden.channels.some((c) => c.id === stream.broadcaster.id) &&
    !hidden.categories.some((c) => c.id === categoryId)
  );
}
