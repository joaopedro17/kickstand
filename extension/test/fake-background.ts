import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { listenForRequests, type Request, type RequestHandlers } from '@/lib/messages';

type Listener = ReturnType<typeof listenForRequests>;

/** Delivers `message` to a background listener the way the browser does and waits for the reply. */
export function deliver(listener: Listener, message: unknown) {
  return new Promise<{ keptOpen: unknown; reply: unknown }>((resolve) => {
    // The browser calls sendResponse later, after the listener has returned.
    const keptOpen = listener(message, {}, (reply) => resolve({ keptOpen, reply }));
    if (keptOpen !== true) resolve({ keptOpen, reply: undefined });
  });
}

/**
 * Stands in for the background service worker in popup tests: requests go
 * through the real protocol (`listenForRequests`) and are answered by
 * `handlers`. The fake browser's own `sendMessage` can't be used, because it
 * returns the listener's return value instead of what it passes to
 * `sendResponse`.
 */
export function fakeBackground(overrides: Partial<RequestHandlers> = {}) {
  const received: Request[] = [];
  const handlers: RequestHandlers = {
    'poll-now': async () => {},
    login: async () => ({ success: true }),
    'get-access-token': async () => ({ status: 'ok', accessToken: 'access' }),
    logout: async () => {},
    ...overrides,
  };
  const recording = Object.fromEntries(
    Object.entries(handlers).map(([type, handle]) => [
      type,
      (request: Request) => {
        received.push(request);
        return (handle as (r: Request) => Promise<unknown>)(request);
      },
    ])
  ) as RequestHandlers;
  const listener = listenForRequests(recording);
  vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(
    async (message: unknown) => (await deliver(listener, message)).reply as never
  );
  return { received };
}
