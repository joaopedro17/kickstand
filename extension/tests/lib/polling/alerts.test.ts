import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { openNotifiedChannel } from '@/lib/polling/alerts';
import { type TrackedChannel, setTracked } from '@/lib/channels/tracked';
import { fakePermissions } from '@/tests/support/fake-permissions';

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

  describe('with permission to see tabs', () => {
    function openTabs(...tabs: { id: number; windowId: number; url: string }[]) {
      return vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue(tabs as never);
    }

    beforeEach(async () => {
      fakePermissions({ granted: ['tabs'] });
      await setTracked([tracked(7)]);
    });

    it('switches to a tab already showing the channel instead of opening another', async () => {
      const query = openTabs(
        { id: 3, windowId: 1, url: 'https://kick.com/other' },
        { id: 4, windowId: 2, url: 'https://www.kick.com/Slug7/videos' }
      );
      const update = vi.spyOn(fakeBrowser.tabs, 'update').mockResolvedValue({} as never);
      const focus = vi.spyOn(fakeBrowser.windows, 'update');
      const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);

      await openNotifiedChannel('kickstand-live-7');

      expect(query).toHaveBeenCalledWith({ url: ['https://kick.com/*', 'https://www.kick.com/*'] });
      expect(update).toHaveBeenCalledWith(4, { active: true });
      expect(focus).toHaveBeenCalledWith(2, { focused: true });
      expect(create).not.toHaveBeenCalled();
    });

    it('opens a new tab when none shows the channel', async () => {
      openTabs({ id: 3, windowId: 1, url: 'https://kick.com/other' });
      const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);

      await openNotifiedChannel('kickstand-live-7');

      expect(create).toHaveBeenCalledWith({ url: 'https://kick.com/slug7' });
    });
  });

  it('does not look at tabs without permission', async () => {
    await setTracked([tracked(7)]);
    const query = vi.spyOn(fakeBrowser.tabs, 'query');
    vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);

    await openNotifiedChannel('kickstand-live-7');

    expect(query).not.toHaveBeenCalled();
  });
});
