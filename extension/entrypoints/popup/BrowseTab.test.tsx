// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeBackground } from '@/tests/support/fake-background';
import { fakeKick, page, rawStream } from '@/tests/support/fake-kick';
import { BrowseTab } from './BrowseTab';

const LIVESTREAMS = '/public/v2/livestreams';

const shownStreams = () =>
  screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('BrowseTab', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    fakeBackground();
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
});
