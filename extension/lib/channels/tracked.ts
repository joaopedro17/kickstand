import { browser } from 'wxt/browser';
import { chunk } from '@/lib/chunk';
import type { Channel } from '@/lib/kick/types';
import { serialQueue } from '@/lib/serial';

/**
 * The tracked-channel list, in browser sync storage.
 *
 * Sync storage caps each item at 8 KB, which one list of every channel hit at
 * roughly 85–90 channels. The list is therefore split across numbered items
 * of CHANNELS_PER_CHUNK channels, plus a meta item saying how many there are.
 * Everything is written in one `set` call; leftover items from a longer list
 * are removed afterwards. A crash in between leaves extra items that the meta
 * item already excludes, so reads stay correct and the next write cleans up.
 */

export interface TrackedChannel {
  broadcasterUserId: number;
  slug: string;
  addedAt: number;
  muted: boolean;
}

export const MAX_TRACKED = 500;
const CHANNELS_PER_CHUNK = 50;

const META_KEY = 'trackedChannels.v2.meta';
const LEGACY_KEY = 'trackedChannels';
const chunkKey = (index: number) => `trackedChannels.v2.${index}`;

/** `rev` changes on every write, so watchers hear about writes that keep the chunk count. */
interface Meta {
  chunks: number;
  rev: number;
}

export class TrackedListFullError extends Error {
  constructor() {
    super(`Cannot track more than ${MAX_TRACKED} channels`);
  }
}

/** True for the errors browsers raise when sync storage has no room left. */
export function isStorageFullError(err: unknown): boolean {
  return err instanceof Error && /quota/i.test(err.message);
}

const sync = () => browser.storage.sync;

async function readMeta(): Promise<Meta | undefined> {
  return (await sync().get(META_KEY))[META_KEY] as Meta | undefined;
}

function chunkKeys(from: number, to: number): string[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => chunkKey(from + i));
}

async function readChunks(meta: Meta): Promise<TrackedChannel[]> {
  const keys = chunkKeys(0, meta.chunks);
  const stored = await sync().get(keys);
  return keys.flatMap((key) => (stored[key] as TrackedChannel[] | undefined) ?? []);
}

async function write(list: TrackedChannel[], previous: Meta | undefined): Promise<void> {
  if (list.length > MAX_TRACKED) throw new TrackedListFullError();
  const parts = chunk(list, CHANNELS_PER_CHUNK);
  const meta: Meta = { chunks: parts.length, rev: (previous?.rev ?? 0) + 1 };
  await sync().set({
    ...Object.fromEntries(parts.map((part, i) => [chunkKey(i), part])),
    [META_KEY]: meta,
  });
  const stale = chunkKeys(parts.length, previous?.chunks ?? 0);
  if (stale.length > 0) await sync().remove(stale);
}

/** Moves a list stored by an earlier version (one item) into the chunked format. */
async function migrateLegacy(): Promise<TrackedChannel[]> {
  const legacy = ((await sync().get(LEGACY_KEY))[LEGACY_KEY] as TrackedChannel[] | undefined) ?? [];
  if (legacy.length === 0) return [];
  await write(legacy, undefined);
  await sync().remove(LEGACY_KEY);
  return legacy;
}

export async function getTracked(): Promise<TrackedChannel[]> {
  const meta = await readMeta();
  return meta ? readChunks(meta) : migrateLegacy();
}

export async function setTracked(list: TrackedChannel[]): Promise<void> {
  await write(list, await readMeta());
}

const enqueue = serialQueue();

function update<T>(change: (list: TrackedChannel[]) => { list: TrackedChannel[]; result: T }): Promise<T> {
  return enqueue(async () => {
    const current = await getTracked();
    const { list, result } = change(current);
    if (list !== current) await setTracked(list);
    return result;
  });
}

export interface AddOutcome {
  added: Channel[];
  alreadyTracked: Channel[];
}

/**
 * Tracks each channel not tracked yet, unmuted, at the end of the list. The
 * one way channels are added: typed, pasted, from the current tab, from
 * Browse, or imported. A batch that would go over MAX_TRACKED adds nothing.
 */
export function addChannels(channels: Channel[], now: number): Promise<AddOutcome> {
  return update((list) => {
    const ids = new Set(list.map((c) => c.broadcasterUserId));
    const added: Channel[] = [];
    const alreadyTracked: Channel[] = [];
    for (const channel of channels) {
      if (ids.has(channel.broadcasterUserId)) {
        alreadyTracked.push(channel);
      } else {
        ids.add(channel.broadcasterUserId);
        added.push(channel);
      }
    }
    const fresh = added.map((c) => ({ ...c, addedAt: now, muted: false }));
    return {
      list: added.length > 0 ? [...list, ...fresh] : list,
      result: { added, alreadyTracked },
    };
  });
}

export function removeTracked(broadcasterUserId: number): Promise<void> {
  return update((list) => ({
    list: list.filter((c) => c.broadcasterUserId !== broadcasterUserId),
    result: undefined,
  }));
}

export function toggleMuted(broadcasterUserId: number): Promise<void> {
  return update((list) => ({
    list: list.map((c) => (c.broadcasterUserId === broadcasterUserId ? { ...c, muted: !c.muted } : c)),
    result: undefined,
  }));
}

/** Calls `onChange` with the full list whenever it changes, here or on another synced device. */
export function watchTracked(onChange: (list: TrackedChannel[]) => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === 'sync' && META_KEY in changes) getTracked().then(onChange);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
