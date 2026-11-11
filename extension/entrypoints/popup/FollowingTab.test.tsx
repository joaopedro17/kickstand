// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeBackground } from '@/test/fake-background';
import type { Request } from '@/lib/messages';
import { FollowingTab } from './FollowingTab';
import { liveStatusStorage, type ChannelStatus, type TrackedChannel } from '@/lib/storage';
import { getTracked, setTracked, MAX_TRACKED } from '@/lib/tracked-channels';

function kickReturns(channels: { broadcaster_user_id: number; slug: string }[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: channels }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function tracked(id: number, slug: string): TrackedChannel {
  return { broadcasterUserId: id, slug, addedAt: id, muted: false };
}

function live(title: string, viewerCount: number): ChannelStatus {
  return {
    status: {
      kind: 'live',
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
  });

  it('tells the user when no channel has that slug', async () => {
    kickReturns([]);
    render(<FollowingTab />);

    await userEvent.type(screen.getByRole('textbox'), 'nobody');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByText('No channel found for "nobody"')).toBeInTheDocument();
    expect(await getTracked()).toEqual([]);
  });

  it('refuses a channel that is already tracked', async () => {
    await setTracked([tracked(42, 'xqc')]);
    kickReturns([{ broadcaster_user_id: 42, slug: 'xqc' }]);
    render(<FollowingTab />);

    await userEvent.type(screen.getByRole('textbox'), 'xqc');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByText('"xqc" is already tracked')).toBeInTheDocument();
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
