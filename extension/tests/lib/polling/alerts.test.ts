import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { openNotifiedChannel } from '@/lib/polling/alerts';
import { type TrackedChannel, setTracked } from '@/lib/channels/tracked';

async function notifications() {
  return Object.keys(await fakeBrowser.notifications.getAll());
}

function tracked(id: number, muted = false): TrackedChannel {
  return { broadcasterUserId: id, slug: `slug${id}`, addedAt: id, muted };
}

describe('openNotifiedChannel', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the channel on kick.com and clears the notification', async () => {
    await setTracked([tracked(7)]);
    await fakeBrowser.notifications.create('kickstand-live-7', {
      type: 'basic',
      iconUrl: '',
      title: '',
      message: '',
    });
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);

    await openNotifiedChannel('kickstand-live-7');

    expect(create).toHaveBeenCalledWith({ url: 'https://kick.com/slug7' });
    expect(await notifications()).toEqual([]);
  });

  it('ignores notifications that are not Kickstand live alerts', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);

    await openNotifiedChannel('something-else');

    expect(create).not.toHaveBeenCalled();
  });

  it('opens nothing for a channel that was untracked since', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);

    await openNotifiedChannel('kickstand-live-7');

    expect(create).not.toHaveBeenCalled();
  });
});
