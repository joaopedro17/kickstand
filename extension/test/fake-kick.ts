import { vi } from 'vitest';

type Body = unknown;

/**
 * Stands in for Kick's API in popup tests. Each request is answered by the
 * first route whose path matches, in the order requests arrive. `hold()`
 * keeps the next matching request pending until the test releases it, to
 * stage responses that arrive out of order.
 */
export function fakeKick(routes: Record<string, (url: URL) => Body>) {
  const held: { path: string; release: () => void }[] = [];
  const holdNext = new Set<string>();
  const requests: URL[] = [];

  const respond = (url: URL) => {
    const route = Object.keys(routes).find((path) => url.pathname === path);
    if (!route) throw new Error(`No fake route for ${url.pathname}`);
    return { ok: true, status: 200, json: async () => routes[route](url) };
  };

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: string) => {
      const url = new URL(input);
      requests.push(url);
      if (holdNext.delete(url.pathname)) {
        await new Promise<void>((release) => held.push({ path: url.pathname, release }));
      }
      return respond(url);
    })
  );

  return {
    requests,
    /** Keeps the next request to `path` waiting until `releaseHeld()`. */
    hold(path: string) {
      holdNext.add(path);
    },
    /** Lets the oldest held request finish. */
    async releaseHeld() {
      const next = held.shift();
      if (!next) throw new Error('No request is being held');
      next.release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

export function rawStream(id: number, viewers: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `s${id}`,
    broadcaster_user: { id, username: `user${id}`, profile_picture: '' },
    channel: { slug: `streamer${id}` },
    title: `Stream ${id}`,
    category: { id: 1, name: 'Just Chatting', thumbnail: '' },
    thumbnail: '',
    started_at: '2026-11-11T10:00:00Z',
    viewer_count: viewers,
    has_mature_content: false,
    language_code: 'en',
    tags: [],
    ...overrides,
  };
}

export function rawCategory(id: number, name: string, tags: string[] = []) {
  return { id, name, thumbnail: '', tags };
}

export function page(data: unknown[], nextCursor: string | null = null) {
  return { data, pagination: { next_cursor: nextCursor } };
}
