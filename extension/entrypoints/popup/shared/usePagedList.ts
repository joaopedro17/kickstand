import { useCallback, useEffect, useRef, useState } from 'react';
import { KickApiError } from '@/lib/kick/error';
import { translateErrorCode } from './error-messages';
import { withAuthRetry } from '@/lib/auth/client';
import type { Page } from '@/lib/kick/types';

type Keyed = { id: string | number };

/** Fetches one page; `cursor` is undefined for the first. */
export type FetchPage<T> = (cursor: string | undefined, accessToken: string) => Promise<Page<T>>;

/** `page` with the items already in `shown` left out, appended after them. */
export function appendUnique<T extends Keyed>(shown: T[], page: T[]): T[] {
  const seen = new Set(shown.map((item) => item.id));
  return [...shown, ...page.filter((item) => !seen.has(item.id))];
}

function describeLoadError(err: unknown): string {
  return translateErrorCode(err instanceof KickApiError ? err.kind : 'unknown');
}

type Outcome<T> = { page: Page<T> } | { error: string };

/** One page, or the message to show instead. */
async function fetchOutcome<T>(fetchPage: FetchPage<T>, cursor: string | undefined): Promise<Outcome<T>> {
  try {
    const page = await withAuthRetry((accessToken) => fetchPage(cursor, accessToken));
    return page ? { page } : { error: translateErrorCode('not_logged_in') };
  } catch (err) {
    return { error: describeLoadError(err) };
  }
}

/**
 * A list loaded from Kick a page at a time.
 *
 * Changing `key` starts over. Each start-over begins a new generation, and a
 * response that belongs to an older one is dropped, so a slow answer for a
 * category or search the user already left can't replace the current list.
 * `arrange` orders each page before it is appended; pages already shown keep
 * their place, so "Load more" never reshuffles what the user is looking at.
 */
export function usePagedList<T extends Keyed>(
  key: string,
  fetchPage: FetchPage<T>,
  arrange: (page: T[]) => T[] = (page) => page
) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  // The latest callbacks and cursor, read when a load starts, so `load` itself
  // never changes and the start-over effect depends on `key` alone.
  const latest = useRef({ fetchPage, arrange, cursor });
  latest.current = { fetchPage, arrange, cursor };

  const load = useCallback(async (startOver: boolean) => {
    if (startOver) {
      generation.current += 1;
      setItems([]);
      setCursor(null);
    }
    const mine = generation.current;
    const { fetchPage, arrange, cursor } = latest.current;
    setLoading(true);
    setError(null);
    const outcome = await fetchOutcome(fetchPage, startOver ? undefined : (cursor ?? undefined));
    if (mine !== generation.current) return;
    setLoading(false);
    if ('error' in outcome) {
      setError(outcome.error);
      return;
    }
    setItems((shown) => appendUnique(startOver ? [] : shown, arrange(outcome.page.items)));
    setCursor(outcome.page.nextCursor);
  }, []);

  useEffect(() => {
    load(true);
  }, [key, load]);

  return {
    items,
    loading,
    error,
    hasMore: cursor !== null,
    loadMore: () => load(false),
    reload: () => load(true),
  };
}
