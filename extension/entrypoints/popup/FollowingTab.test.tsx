// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { FollowingTab } from './FollowingTab';
import {
  authTokensStorage,
  liveStatusStorage,
  trackedChannelsStorage,
  type LiveStatusEntry,
  type TrackedChannel,
} from '@/lib/storage';

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

function live(title: string, viewerCount: number): LiveStatusEntry {
  return {
    isLive: true,
    viewerCount,
    category: { id: 1, name: 'Just Chatting' },
    thumbnail: null,
    title,
    avatarUrl: null,
    lastCheckedAt: 1,
  };
}

describe('FollowingTab', () => {
  const backgroundMessages: unknown[] = [];

  beforeEach(async () => {
    fakeBrowser.reset();
    backgroundMessages.length = 0;
    fakeBrowser.runtime.onMessage.addListener((message: unknown) => {
      backgroundMessages.push(message);
    });
    await authTokensStorage.setValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      refreshExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tracks a channel the user adds by slug and asks the background to poll', async () => {
    kickReturns([{ broadcaster_user_id: 42, slug: 'xqc' }]);
    render(<FollowingTab />);

    await userEvent.type(screen.getByRole('textbox'), '  XQC ');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByText('Offline (1)')).toBeInTheDocument();
    expect(await trackedChannelsStorage.getValue()).toEqual([
      expect.objectContaining({ broadcasterUserId: 42, slug: 'xqc', muted: false }),
    ]);
    expect(backgroundMessages).toEqual([{ type: 'poll-now' }]);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('tells the user when no channel has that slug', async () => {
    kickReturns([]);
    render(<FollowingTab />);

    await userEvent.type(screen.getByRole('textbox'), 'nobody');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByText('No channel found for "nobody"')).toBeInTheDocument();
    expect(await trackedChannelsStorage.getValue()).toEqual([]);
  });

  it('refuses a channel that is already tracked', async () => {
    await trackedChannelsStorage.setValue([tracked(42, 'xqc')]);
    kickReturns([{ broadcaster_user_id: 42, slug: 'xqc' }]);
    render(<FollowingTab />);

    await userEvent.type(screen.getByRole('textbox'), 'xqc');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByText('"xqc" is already tracked')).toBeInTheDocument();
    expect(await trackedChannelsStorage.getValue()).toHaveLength(1);
  });

  it('lists live channels by viewer count, highest first, with offline ones collapsed', async () => {
    await trackedChannelsStorage.setValue([
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
    await trackedChannelsStorage.setValue([tracked(2, 'big')]);
    await liveStatusStorage.setValue({ 2: live('big stream', 5000) });
    render(<FollowingTab />);

    await userEvent.click(await screen.findByRole('button', { name: 'Mute big' }));

    expect(await screen.findByRole('button', { name: 'Unmute big' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect((await trackedChannelsStorage.getValue())[0].muted).toBe(true);
  });

  it('opens the channel on kick.com when its row is clicked', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);
    await trackedChannelsStorage.setValue([tracked(2, 'big')]);
    await liveStatusStorage.setValue({ 2: live('big stream', 5000) });
    render(<FollowingTab />);

    await userEvent.click(await screen.findByText('big stream'));

    expect(create).toHaveBeenCalledWith({ url: 'https://kick.com/big' });
  });
});
