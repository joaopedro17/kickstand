// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeBackground } from '@/tests/support/fake-background';
import { fakeKick, page, rawStream } from '@/tests/support/fake-kick';
import type { Request } from '@/lib/messages';
import { getTracked, setTracked } from '@/lib/channels/tracked';
import { getSettings, updateSettings } from '@/lib/settings';
import { BrowseTab } from '@/entrypoints/popup/browse/BrowseTab';

const LIVESTREAMS = '/public/v2/livestreams';

const shownStreams = () =>
  screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('BrowseTab', () => {
  let backgroundReceived: Request[];

  beforeEach(() => {
    fakeBrowser.reset();
    backgroundReceived = fakeBackground().received;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows live streams, most viewers first', async () => {
    fakeKick({ [LIVESTREAMS]: () => page([rawStream(1, 10), rawStream(2, 900), rawStream(3, 50)]) });
    render(<BrowseTab />);

    await screen.findByText('streamer2');
    expect(shownStreams()).toEqual(['streamer2', 'streamer3', 'streamer1']);
  });

  it('asks Kick for a large batch, so the sort is representative', async () => {
    const kick = fakeKick({ [LIVESTREAMS]: () => page([]) });
    render(<BrowseTab />);

    await screen.findByText('No live streams right now.');
    expect(kick.requests[0].searchParams.get('limit')).toBe('100');
  });

  it('filters by category, and offers to clear the filter', async () => {
    const kick = fakeKick({ [LIVESTREAMS]: () => page([rawStream(1, 10)]) });
    const onClear = vi.fn();
    render(<BrowseTab categoryId={42} categoryName="Slots" onClearCategory={onClear} />);

    await screen.findByText('streamer1');
    expect(kick.requests[0].searchParams.getAll('category_id')).toEqual(['42']);
    expect(screen.getByText('Slots')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it('loads the next page when asked, keeping what is already shown in place', async () => {
    const kick = fakeKick({
      [LIVESTREAMS]: (url) =>
        url.searchParams.get('cursor') === 'p2'
          ? page([rawStream(3, 5), rawStream(4, 5000)])
          : page([rawStream(1, 100), rawStream(2, 200)], 'p2'),
    });
    render(<BrowseTab />);
    await screen.findByText('streamer2');

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await screen.findByText('streamer4');
    expect(kick.requests[1].searchParams.get('cursor')).toBe('p2');
    expect(shownStreams()).toEqual(['streamer2', 'streamer1', 'streamer4', 'streamer3']);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('shows a stream only once when a later page repeats it', async () => {
    fakeKick({
      [LIVESTREAMS]: (url) =>
        url.searchParams.get('cursor') === 'p2'
          ? page([rawStream(2, 200), rawStream(3, 300)])
          : page([rawStream(1, 100), rawStream(2, 200)], 'p2'),
    });
    render(<BrowseTab />);
    await screen.findByText('streamer2');

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await screen.findByText('streamer3');
    expect(shownStreams()).toEqual(['streamer2', 'streamer1', 'streamer3']);
  });

  it('ignores a response for a category the user already left', async () => {
    const kick = fakeKick({
      [LIVESTREAMS]: (url) =>
        url.searchParams.get('category_id') === '1'
          ? page([rawStream(1, 10, { channel: { slug: 'old-category' } })])
          : page([rawStream(2, 10, { channel: { slug: 'new-category' } })]),
    });
    kick.hold(LIVESTREAMS);
    const { rerender } = render(<BrowseTab categoryId={1} categoryName="Old" />);
    // The old category's request is in flight before the user moves on.
    await expect.poll(() => kick.requests.length).toBe(1);

    rerender(<BrowseTab categoryId={2} categoryName="New" />);
    await screen.findByText('new-category');
    await kick.releaseHeld();

    expect(screen.queryByText('old-category')).not.toBeInTheDocument();
    expect(shownStreams()).toEqual(['new-category']);
  });

  it('shows an error with a retry that loads again', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () =>
        fail
          ? Promise.reject(new TypeError('Failed to fetch'))
          : { ok: true, status: 200, json: async () => page([rawStream(1, 1)]) }
      )
    );
    render(<BrowseTab />);

    expect(
      await screen.findByText('Network error — check your connection and try again.')
    ).toBeInTheDocument();

    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('streamer1')).toBeInTheDocument();
  });

  it('says the user is not logged in when the session has ended', async () => {
    fakeBackground({ 'get-access-token': async () => ({ status: 'logged-out' }) });
    const kick = fakeKick({ [LIVESTREAMS]: () => page([rawStream(1, 1)]) });
    render(<BrowseTab />);

    expect(await screen.findByText("You're not logged in.")).toBeInTheDocument();
    expect(kick.requests).toHaveLength(0);
  });

  it('says so when nobody is live', async () => {
    fakeKick({ [LIVESTREAMS]: () => page([]) });
    render(<BrowseTab />);

    expect(await screen.findByText('No live streams right now.')).toBeInTheDocument();
  });

  it('opens a stream on kick.com when its card is clicked', async () => {
    fakeKick({ [LIVESTREAMS]: () => page([rawStream(1, 10)]) });
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);
    render(<BrowseTab />);

    await userEvent.click(await screen.findByText('streamer1'));

    expect(create).toHaveBeenCalledWith({ url: 'https://kick.com/streamer1' });
  });

  describe('tracking from a card', () => {
    it('tracks the streamer without opening the stream, and asks for a poll', async () => {
      const kick = fakeKick({ [LIVESTREAMS]: () => page([rawStream(7, 10)]) });
      const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);
      render(<BrowseTab />);

      await userEvent.click(await screen.findByRole('button', { name: 'Track streamer7' }));

      await expect.poll(async () => await getTracked()).toEqual([
        expect.objectContaining({ broadcasterUserId: 7, slug: 'streamer7', muted: false }),
      ]);
      expect(create).not.toHaveBeenCalled();
      expect(backgroundReceived).toContainEqual({ type: 'poll-now' });
      expect(kick.requests.every((u) => u.pathname === LIVESTREAMS)).toBe(true);
      expect(await screen.findByRole('button', { name: 'streamer7 is tracked' })).toBeDisabled();
    });

    it('shows a streamer already tracked as tracked', async () => {
      await setTracked([{ broadcasterUserId: 2, slug: 'streamer2', addedAt: 1, muted: false }]);
      fakeKick({ [LIVESTREAMS]: () => page([rawStream(1, 10), rawStream(2, 5)]) });
      render(<BrowseTab />);

      expect(await screen.findByRole('button', { name: 'streamer2 is tracked' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Track streamer1' })).toBeEnabled();
    });
  });

  describe('language', () => {
    const languageSelect = () => screen.findByRole('combobox', { name: 'Language' });

    it('shows every language until one is picked, then asks Kick for that one and remembers it', async () => {
      const kick = fakeKick({ [LIVESTREAMS]: () => page([rawStream(1, 10)]) });
      render(<BrowseTab />);
      await screen.findByText('streamer1');
      expect(kick.requests[0].searchParams.has('language_code')).toBe(false);
      expect(await languageSelect()).toHaveValue('');

      await userEvent.selectOptions(await languageSelect(), 'pt');

      await expect.poll(() => kick.requests.at(-1)?.searchParams.get('language_code')).toBe('pt');
      await expect.poll(async () => (await getSettings()).browseLanguage).toBe('pt');
    });

    it('starts with the language picked last time', async () => {
      await updateSettings({ browseLanguage: 'es' });
      const kick = fakeKick({ [LIVESTREAMS]: () => page([rawStream(1, 10)]) });
      render(<BrowseTab />);

      await screen.findByText('streamer1');
      expect(kick.requests.every((u) => u.searchParams.get('language_code') === 'es')).toBe(true);
      expect(await languageSelect()).toHaveValue('es');
    });

    it('goes back to every language', async () => {
      await updateSettings({ browseLanguage: 'es' });
      const kick = fakeKick({ [LIVESTREAMS]: () => page([rawStream(1, 10)]) });
      render(<BrowseTab />);
      await screen.findByText('streamer1');

      await userEvent.selectOptions(await languageSelect(), '');

      await expect.poll(async () => (await getSettings()).browseLanguage).toBeNull();
      await expect.poll(() => kick.requests.at(-1)?.searchParams.has('language_code')).toBe(false);
    });
  });

  describe('mature streams', () => {
    const thumbnailOf = (slug: string) => screen.getByText(slug).closest('[class*="group"]')!.querySelector('img')!;

    it('blurs the thumbnail of a stream marked mature, and says why', async () => {
      fakeKick({
        [LIVESTREAMS]: () =>
          page([
            rawStream(1, 10, { thumbnail: 'https://thumb/1', has_mature_content: true }),
            rawStream(2, 5, { thumbnail: 'https://thumb/2' }),
          ]),
      });
      render(<BrowseTab />);

      await screen.findByText('streamer1');
      expect(thumbnailOf('streamer1')).toHaveClass('blur-xl');
      expect(screen.getAllByText('Mature')).toHaveLength(1);
      expect(thumbnailOf('streamer2')).not.toHaveClass('blur-xl');
    });

    it('shows mature thumbnails as they are once the user turns blurring off', async () => {
      await updateSettings({ blurMature: false });
      fakeKick({
        [LIVESTREAMS]: () => page([rawStream(1, 10, { thumbnail: 'https://thumb/1', has_mature_content: true })]),
      });
      render(<BrowseTab />);

      await screen.findByText('streamer1');
      expect(thumbnailOf('streamer1')).not.toHaveClass('blur-xl');
      expect(screen.queryByText('Mature')).toBeNull();
    });
  });
});
