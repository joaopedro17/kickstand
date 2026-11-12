import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { deliver } from '@/tests/support/fake-background';
import { listenForRequests, sendRequest, type RequestHandlers } from './messages';

function handlers(overrides: Partial<RequestHandlers> = {}): RequestHandlers {
  return {
    'poll-now': vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue({ success: true }),
    'get-access-token': vi.fn().mockResolvedValue({ status: 'logged-out' }),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('listenForRequests', () => {
  it('answers through sendResponse and keeps the channel open, so replies arrive on every Chrome version', async () => {
    const listener = listenForRequests(handlers());

    const { keptOpen, reply } = await deliver(listener, { type: 'login' });

    expect(keptOpen).toBe(true);
    expect(reply).toEqual({ ok: true, value: { success: true } });
  });

  it('passes the request to the matching handler', async () => {
    const pollNow = vi.fn().mockResolvedValue(undefined);
    const listener = listenForRequests(handlers({ 'poll-now': pollNow }));

    await deliver(listener, { type: 'poll-now' });

    expect(pollNow).toHaveBeenCalledWith({ type: 'poll-now' });
  });

  it('replies with the error message when the handler fails', async () => {
    const listener = listenForRequests(
      handlers({ 'poll-now': vi.fn().mockRejectedValue(new Error('storage full')) })
    );

    const { reply } = await deliver(listener, { type: 'poll-now' });

    expect(reply).toEqual({ ok: false, error: 'storage full' });
  });

  it('replies with the thrown value as text when the handler rejects with a non-Error', async () => {
    const listener = listenForRequests(
      handlers({ 'poll-now': vi.fn().mockRejectedValue('quota exceeded') })
    );

    const { reply } = await deliver(listener, { type: 'poll-now' });

    expect(reply).toEqual({ ok: false, error: 'quota exceeded' });
  });

  it.each([undefined, null, 'poll-now', {}, { type: 'unknown' }, { type: 42 }])(
    'ignores %j, leaving it for other listeners',
    async (message) => {
      const listener = listenForRequests(handlers());

      const { keptOpen } = await deliver(listener, message);

      expect(keptOpen).toBeUndefined();
    }
  );
});

describe('sendRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the value the background replied with', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
      ok: true,
      value: { success: true },
    });

    expect(await sendRequest({ type: 'login' })).toEqual({ success: true });
  });

  it('throws the error the background replied with', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
      ok: false,
      error: 'storage full',
    });

    await expect(sendRequest({ type: 'poll-now' })).rejects.toThrow('storage full');
  });

  it('throws when the background sent no reply at all', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined);

    await expect(sendRequest({ type: 'poll-now' })).rejects.toThrow(/no reply/i);
  });
});
