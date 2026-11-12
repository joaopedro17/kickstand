// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeBackground } from '@/tests/support/fake-background';
import type { Request } from '@/lib/messages';
import { FollowingTab } from '@/entrypoints/popup/following/FollowingTab';
import { liveStatusStorage } from '@/lib/polling/storage';
import type { ChannelStatus } from '@/lib/polling/live-status';
import { type TrackedChannel, getTracked, setTracked, MAX_TRACKED } from '@/lib/channels/tracked';
import { MAX_SLUGS_PER_SUBMIT } from '@/lib/channels/slug-input';
import { fakeKick } from '@/tests/support/fake-kick';
import { avatarStorage } from '@/lib/channels/avatars';

function kickReturns(channels: { broadcaster_user_id: number; slug: string }[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: channels }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const CHANNELS = '/public/v1/channels';

/** Kick knows these channels, slug to broadcaster id, and answers lookups for them. */
function kickKnows(channels: Record<string, number>) {
  return fakeKick({
    [CHANNELS]: (url) => ({
      data: url.searchParams
        .getAll('slug')
        .filter((slug) => slug in channels)
        .map((slug) => ({ broadcaster_user_id: channels[slug], slug })),
    }),
  });
}

function onTab(url: string | undefined) {
  vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([{ url } as never]);
}

const addInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Channel name or kick.com link' });
const addButton = () => screen.getByRole('button', { name: 'Add' });

function tracked(id: number, slug: string): TrackedChannel {
  return { broadcasterUserId: id, slug, addedAt: id, muted: false };
}

function live(title: string, viewerCount: number): ChannelStatus {
  return {
    status: {
      kind: 'live',
      broadcasterName: '',
      startedAt: '2026-11-11T10:00:00Z',
      viewerCount,
      title,
      category: { id: 1, name: 'Just Chatting' },
      thumbnail: null,
    },
    notifiedStartedAt: '2026-11-11T10:00:00Z',
    avatarUrl: null,
    lastCheckedAt: 1,
  };
}

describe('FollowingTab', () => {
  let backgroundReceived: Request[];

  beforeEach(() => {
    fakeBrowser.reset();
    backgroundReceived = fakeBackground().received;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('when opened', () => {
    it('asks the background to poll when the live status is over a minute old', async () => {
      await setTracked([tracked(1, 'one')]);
      await liveStatusStorage.setValue({ 1: { ...live('t', 1), lastCheckedAt: Date.now() - 61_000 } });

      render(<FollowingTab />);

      await expect.poll(() => backgroundReceived).toContainEqual({ type: 'poll-now' });
    });

    it('asks the background to poll when tracked channels have never been polled', async () => {
      await setTracked([tracked(1, 'one')]);

      render(<FollowingTab />);

      await expect.poll(() => backgroundReceived).toContainEqual({ type: 'poll-now' });
    });

    it('does not ask for a poll when the live status is fresh', async () => {
      await setTracked([tracked(1, 'one')]);
      await liveStatusStorage.setValue({ 1: { ...live('t', 1), lastCheckedAt: Date.now() - 5_000 } });

      render(<FollowingTab />);
      await screen.findByText('one');

      expect(backgroundReceived).not.toContainEqual({ type: 'poll-now' });
    });

    it('does not ask for a poll when nothing is tracked', async () => {
      render(<FollowingTab />);
      await screen.findByText('No tracked channels yet.');

      expect(backgroundReceived).not.toContainEqual({ type: 'poll-now' });
    });
  });

  describe('freshness', () => {
    it('says how long ago live status was updated', async () => {
      await setTracked([tracked(1, 'one'), tracked(2, 'two')]);
      await liveStatusStorage.setValue({
        1: { ...live('t', 1), lastCheckedAt: Date.now() - 10 * 60_000 },
        2: { ...live('t', 1), lastCheckedAt: Date.now() - 3 * 60_000 - 5_000 },
      });

      render(<FollowingTab />);

      expect(await screen.findByText('Updated 3 min ago')).toBeInTheDocument();
    });

    it('says "just now" within the first minute', async () => {
      await setTracked([tracked(1, 'one')]);
      await liveStatusStorage.setValue({ 1: { ...live('t', 1), lastCheckedAt: Date.now() - 5_000 } });

      render(<FollowingTab />);

      expect(await screen.findByText('Updated just now')).toBeInTheDocument();
    });

    it('keeps the label current while the popup stays open', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      try {
        await setTracked([tracked(1, 'one')]);
        await liveStatusStorage.setValue({ 1: { ...live('t', 1), lastCheckedAt: Date.now() - 5_000 } });
        render(<FollowingTab />);
        await screen.findByText('Updated just now');

        await act(async () => {
          vi.advanceTimersByTime(2 * 60_000);
        });

        expect(screen.getByText('Updated 2 min ago')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows no label before anything was polled', async () => {
      render(<FollowingTab />);
      await screen.findByText('No tracked channels yet.');

      expect(screen.queryByText(/^Updated/)).toBeNull();
    });

    it('refreshes on demand', async () => {
      await setTracked([tracked(1, 'one')]);
      await liveStatusStorage.setValue({ 1: { ...live('t', 1), lastCheckedAt: Date.now() - 5_000 } });
      render(<FollowingTab />);

      await userEvent.click(await screen.findByRole('button', { name: 'Refresh live status' }));

      expect(backgroundReceived).toContainEqual({ type: 'poll-now' });
    });

    it('cannot be refreshed again while a refresh is running', async () => {
      let finish = () => {};
      fakeBackground({ 'poll-now': () => new Promise<void>((resolve) => (finish = resolve)) });
      await setTracked([tracked(1, 'one')]);
      await liveStatusStorage.setValue({ 1: { ...live('t', 1), lastCheckedAt: Date.now() - 5_000 } });
      render(<FollowingTab />);
      const refresh = await screen.findByRole('button', { name: 'Refresh live status' });

      await userEvent.click(refresh);
      expect(refresh).toBeDisabled();

      finish();
      await expect.poll(() => refresh.hasAttribute('disabled')).toBe(false);
    });
  });

  describe('when the last poll failed', () => {
    it('says the status is not current and offers a retry that polls', async () => {
      await setTracked([tracked(1, 'one')]);
      await liveStatusStorage.setValue({
        1: { ...live('t', 1), lastCheckedAt: Date.now(), lastError: 'Network request failed' },
      });
      render(<FollowingTab />);

      expect(
        await screen.findByText("Couldn't refresh live status. Showing the last known state.")
      ).toBeInTheDocument();
      backgroundReceived.length = 0;
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

      expect(backgroundReceived).toContainEqual({ type: 'poll-now' });
    });

    it('shows no warning when the last poll worked', async () => {
      await setTracked([tracked(1, 'one')]);
      await liveStatusStorage.setValue({ 1: { ...live('t', 1), lastCheckedAt: Date.now() } });
      render(<FollowingTab />);

      await screen.findByText('one');
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });
  });

  it('names the add-channel section for screen readers', () => {
    render(<FollowingTab />);

    expect(screen.getByRole('region', { name: 'Add a channel' })).toBeInTheDocument();
  });

  it('tracks a channel the user adds by slug and asks the background to poll', async () => {
    kickReturns([{ broadcaster_user_id: 42, slug: 'xqc' }]);
    render(<FollowingTab />);

    await userEvent.type(screen.getByRole('textbox'), '  XQC ');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByText('Offline (1)')).toBeInTheDocument();
    expect(await getTracked()).toEqual([
      expect.objectContaining({ broadcasterUserId: 42, slug: 'xqc', muted: false }),
    ]);
    expect(backgroundReceived).toContainEqual({ type: 'poll-now' });
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByText('Now tracking xqc')).toBeInTheDocument();
  });

  describe('adding several channels at once', () => {
    it('tracks every name and link pasted, in one request to Kick', async () => {
      const kick = kickKnows({ xqc: 1, amouranth: 2, adin: 3 });
      render(<FollowingTab />);

      await userEvent.click(addInput());
      await userEvent.paste('https://kick.com/xqc\n@amouranth, kick.com/adin/videos');
      await userEvent.click(addButton());

      await expect.poll(async () => (await getTracked()).map((c) => c.slug)).toEqual(['xqc', 'amouranth', 'adin']);
      expect(kick.requests).toHaveLength(1);
      expect(kick.requests[0].searchParams.getAll('slug')).toEqual(['xqc', 'amouranth', 'adin']);
      expect(screen.getByText('Now tracking xqc, amouranth, adin')).toBeInTheDocument();
      expect(addInput()).toHaveValue('');
    });

    it('turns the line breaks of a pasted list into spaces, at the cursor', async () => {
      render(<FollowingTab />);

      await userEvent.type(addInput(), 'first last');
      addInput().setSelectionRange(6, 6);
      await userEvent.paste('a\nb\r\nc ');

      expect(addInput()).toHaveValue('first a b c last');
    });

    it('says what happened to each channel, and leaves the ones to fix in the box', async () => {
      await setTracked([tracked(1, 'xqc')]);
      kickKnows({ xqc: 1, amouranth: 2 });
      render(<FollowingTab />);

      await userEvent.type(addInput(), 'xqc amouranth ghost bad!name');
      await userEvent.click(addButton());

      expect(await screen.findByText('Now tracking amouranth')).toBeInTheDocument();
      expect(screen.getByText('Already tracked: xqc')).toBeInTheDocument();
      expect(screen.getByText('No channel found for: ghost')).toBeInTheDocument();
      expect(screen.getByText('Not a channel name or kick.com link: bad!name')).toBeInTheDocument();
      expect(addInput()).toHaveValue('bad!name ghost');
    });

    it('does not ask Kick when nothing typed is a channel name', async () => {
      const kick = kickKnows({});
      render(<FollowingTab />);

      await userEvent.type(addInput(), 'https://twitch.tv/xqc');
      await userEvent.click(addButton());

      expect(await screen.findByText('Not a channel name or kick.com link: https://twitch.tv/xqc')).toBeInTheDocument();
      expect(kick.requests).toHaveLength(0);
    });

    it(`adds the first ${MAX_SLUGS_PER_SUBMIT} and keeps the rest in the box for the next add`, async () => {
      const slugs = Array.from({ length: MAX_SLUGS_PER_SUBMIT + 2 }, (_, i) => `c${i}`);
      kickKnows(Object.fromEntries(slugs.map((slug, i) => [slug, i + 1])));
      render(<FollowingTab />);

      await userEvent.click(addInput());
      await userEvent.paste(slugs.join(' '));
      await userEvent.click(addButton());

      expect(
        await screen.findByText(`Only ${MAX_SLUGS_PER_SUBMIT} channels can be added at once. The other 2 are still in the box.`)
      ).toBeInTheDocument();
      expect(await getTracked()).toHaveLength(MAX_SLUGS_PER_SUBMIT);
      expect(addInput()).toHaveValue(slugs.slice(MAX_SLUGS_PER_SUBMIT).join(' '));
    });
  });

  describe('the channel open in the current tab', () => {
    it('offers to track it in one click', async () => {
      onTab('https://kick.com/xqc');
      kickKnows({ xqc: 42 });
      render(<FollowingTab />);

      await userEvent.click(await screen.findByRole('button', { name: 'Track xqc' }));

      await expect.poll(async () => (await getTracked()).map((c) => c.slug)).toEqual(['xqc']);
      expect(backgroundReceived).toContainEqual({ type: 'poll-now' });
      await expect.poll(() => screen.queryByRole('button', { name: 'Track xqc' })).toBeNull();
    });

    it('is not offered when the channel is already tracked, without asking Kick', async () => {
      await setTracked([tracked(42, 'xqc')]);
      onTab('https://kick.com/XQC/videos');
      const kick = kickKnows({ xqc: 42 });
      render(<FollowingTab />);

      await screen.findByText('Offline (1)');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByRole('button', { name: /^Track/ })).toBeNull();
      expect(kick.requests).toHaveLength(0);
    });

    it('is not offered when Kick has no such channel', async () => {
      onTab('https://kick.com/ghost');
      const kick = kickKnows({});
      render(<FollowingTab />);

      await expect.poll(() => kick.requests.length).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByRole('button', { name: /^Track/ })).toBeNull();
    });

    it('is not offered on pages that are not a Kick channel', async () => {
      onTab('https://kick.com/categories/slots');
      const kick = kickKnows({ categories: 1 });
      render(<FollowingTab />);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByRole('button', { name: /^Track/ })).toBeNull();
      expect(kick.requests).toHaveLength(0);
    });
  });

  it('tells the user when no channel has that slug', async () => {
    kickReturns([]);
    render(<FollowingTab />);

    await userEvent.type(screen.getByRole('textbox'), 'nobody');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByText('No channel found for: nobody')).toBeInTheDocument();
    expect(await getTracked()).toEqual([]);
  });

  it('refuses a channel that is already tracked', async () => {
    await setTracked([tracked(42, 'xqc')]);
    kickReturns([{ broadcaster_user_id: 42, slug: 'xqc' }]);
    render(<FollowingTab />);

    await userEvent.type(screen.getByRole('textbox'), 'xqc');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByText('Already tracked: xqc')).toBeInTheDocument();
    expect(await getTracked()).toHaveLength(1);
  });

  it('tells the user the list is full instead of adding past the maximum', async () => {
    await setTracked(
      Array.from({ length: MAX_TRACKED }, (_, i) => tracked(i + 1, `channel${i + 1}`))
    );
    kickReturns([{ broadcaster_user_id: 9999, slug: 'newcomer' }]);
    render(<FollowingTab />);

    await userEvent.type(screen.getByRole('textbox'), 'newcomer');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(
      await screen.findByText(`You can track up to ${MAX_TRACKED} channels. Remove one to add another.`)
    ).toBeInTheDocument();
  });

  it('tells the user when Kick cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<FollowingTab />);

    await userEvent.type(screen.getByRole('textbox'), 'xqc');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(
      await screen.findByText('Network error — check your connection and try again.')
    ).toBeInTheDocument();
    expect(await getTracked()).toEqual([]);
  });

  it('tells the user when browser sync storage is full', async () => {
    kickReturns([{ broadcaster_user_id: 42, slug: 'xqc' }]);
    vi.spyOn(fakeBrowser.storage.sync, 'set').mockRejectedValue(
      new Error('QUOTA_BYTES quota exceeded')
    );
    render(<FollowingTab />);

    await userEvent.type(screen.getByRole('textbox'), 'xqc');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(
      await screen.findByText("Your browser's sync storage is full. Remove some channels and try again.")
    ).toBeInTheDocument();
  });

  it('lists live channels by viewer count, highest first, with offline ones collapsed', async () => {
    await setTracked([
      tracked(1, 'small'),
      tracked(2, 'big'),
      tracked(3, 'sleeping'),
    ]);
    await liveStatusStorage.setValue({ 1: live('small stream', 10), 2: live('big stream', 5000) });
    render(<FollowingTab />);

    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(['big', 'small']);
    expect(screen.getByText('Offline (1)')).toBeInTheDocument();
    expect(screen.queryByText('sleeping')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /show offline/i }));
    expect(screen.getByText('sleeping')).toBeInTheDocument();
  });

  describe('how long', () => {
    const MIN = 60_000;
    const HOUR = 60 * MIN;
    const startedAgo = (ms: number): ChannelStatus => {
      const entry = live('t', 1);
      return {
        ...entry,
        status: { ...entry.status, startedAt: new Date(Date.now() - ms).toISOString() } as ChannelStatus['status'],
        lastCheckedAt: Date.now(),
      };
    };
    const offlineSince = (lastLiveAt: number | null): ChannelStatus => ({
      status: { kind: 'offline', lastLiveAt },
      notifiedStartedAt: null,
      avatarUrl: null,
      lastCheckedAt: Date.now(),
    });

    it('says how long each live channel has been live', async () => {
      await setTracked([tracked(1, 'short'), tracked(2, 'long'), tracked(3, 'marathon')]);
      await liveStatusStorage.setValue({
        1: startedAgo(45 * MIN + 10_000),
        2: startedAgo(2 * HOUR + 5 * MIN),
        3: startedAgo(26 * HOUR),
      });

      render(<FollowingTab />);

      expect(await screen.findByText('Live for 45m')).toBeInTheDocument();
      expect(screen.getByText('Live for 2h 5m')).toBeInTheDocument();
      expect(screen.getByText('Live for 1d')).toBeInTheDocument();
    });

    it('leaves out the uptime when Kick gave no start time', async () => {
      await setTracked([tracked(1, 'one')]);
      const entry = live('t', 1);
      await liveStatusStorage.setValue({
        1: { ...entry, status: { ...entry.status, startedAt: null } as ChannelStatus['status'] },
      });

      render(<FollowingTab />);

      await screen.findByText('one');
      expect(screen.queryByText(/^Live for/)).toBeNull();
    });

    it('says when each offline channel was last seen live', async () => {
      await setTracked([tracked(1, 'recent'), tracked(2, 'days'), tracked(3, 'never')]);
      await liveStatusStorage.setValue({
        1: offlineSince(Date.now() - 3 * HOUR),
        2: offlineSince(Date.now() - 50 * HOUR),
        3: offlineSince(null),
      });
      render(<FollowingTab />);

      await userEvent.click(await screen.findByRole('button', { name: /show offline/i }));

      expect(screen.getByText('Last live 3h 0m ago')).toBeInTheDocument();
      expect(screen.getByText('Last live 2d ago')).toBeInTheDocument();
      const never = screen.getByText('never').closest('li')!;
      expect(within(never).getByText('Offline')).toBeInTheDocument();
    });
  });

  describe('pictures of offline channels', () => {
    const offline = (avatarUrl: string | null): ChannelStatus => ({
      status: { kind: 'offline', lastLiveAt: null },
      notifiedStartedAt: null,
      avatarUrl,
      lastCheckedAt: Date.now(),
    });
    const pictureOf = (slug: string) => screen.getByText(slug).closest('li')!.querySelector('img')?.src;

    it('shows the picture fetched for the channel, else the one seen while it was live', async () => {
      await setTracked([tracked(1, 'fetched'), tracked(2, 'seen'), tracked(3, 'none')]);
      await liveStatusStorage.setValue({
        1: offline('https://seen/1'),
        2: offline('https://seen/2'),
        3: offline(null),
      });
      await avatarStorage.setValue({ 1: { url: 'https://fetched/1', fetchedAt: Date.now() } });
      render(<FollowingTab />);

      await userEvent.click(await screen.findByRole('button', { name: /show offline/i }));

      await expect.poll(() => pictureOf('fetched')).toBe('https://fetched/1');
      expect(pictureOf('seen')).toBe('https://seen/2');
      expect(pictureOf('none')).toBeUndefined();
    });
  });

  it('mutes a channel from its row', async () => {
    await setTracked([tracked(2, 'big')]);
    await liveStatusStorage.setValue({ 2: live('big stream', 5000) });
    render(<FollowingTab />);

    await userEvent.click(await screen.findByRole('button', { name: 'Mute big' }));

    expect(await screen.findByRole('button', { name: 'Unmute big' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect((await getTracked())[0].muted).toBe(true);
  });

  it('opens the channel on kick.com when its row is clicked', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);
    await setTracked([tracked(2, 'big')]);
    await liveStatusStorage.setValue({ 2: live('big stream', 5000) });
    render(<FollowingTab />);

    await userEvent.click(await screen.findByText('big stream'));

    expect(create).toHaveBeenCalledWith({ url: 'https://kick.com/big' });
  });
});
