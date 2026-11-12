import { fakeBrowser } from 'wxt/testing/fake-browser';

interface Asked {
  permissions?: string[];
}
type Listener = (asked: Asked) => void;

/**
 * Stands in for the optional-permissions API, which fakeBrowser lacks
 * entirely (events included). `granted` is what the user already allowed;
 * `accept` is how they answer the browser's prompt. Grants and removals call
 * the onAdded / onRemoved listeners. The test setup installs one with
 * nothing granted before each test; a test may install its own.
 */
export function fakePermissions({ granted = [] as string[], accept = true } = {}) {
  const held = new Set(granted);
  const added = new Set<Listener>();
  const removed = new Set<Listener>();

  const contains = async ({ permissions = [] }: Asked) => permissions.every((p) => held.has(p));
  const request = async (asked: Asked) => {
    if (!accept) return false;
    asked.permissions?.forEach((p) => held.add(p));
    added.forEach((listener) => listener(asked));
    return true;
  };
  const remove = async (asked: Asked) => {
    asked.permissions?.forEach((p) => held.delete(p));
    removed.forEach((listener) => listener(asked));
    return true;
  };

  // Assigned rather than spied on: components remove their listeners when
  // they unmount, which happens after a test's vi.restoreAllMocks() would
  // have put fakeBrowser's unimplemented originals back.
  const { permissions } = fakeBrowser;
  Object.assign(permissions, { contains, request, remove });
  for (const [event, listeners] of [
    [permissions.onAdded, added],
    [permissions.onRemoved, removed],
  ] as const) {
    Object.assign(event, {
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
    });
  }
  return { held };
}
