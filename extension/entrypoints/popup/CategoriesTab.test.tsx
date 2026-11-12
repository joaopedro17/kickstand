// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeBackground } from '@/test/fake-background';
import { fakeKick, page, rawCategory } from '@/test/fake-kick';
import { CategoriesTab } from './CategoriesTab';

const CATEGORIES = '/public/v2/categories';

const shownCategories = () =>
  screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('CategoriesTab', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    fakeBackground();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists categories with their first two tags', async () => {
    fakeKick({
      [CATEGORIES]: () =>
        page([rawCategory(1, 'Slots', ['casino', 'gambling', 'extra']), rawCategory(2, 'IRL')]),
    });
    render(<CategoriesTab onSelectCategory={vi.fn()} />);

    await screen.findByText('Slots');
    expect(shownCategories()).toEqual(['Slots', 'IRL']);
    expect(screen.getByText('casino · gambling')).toBeInTheDocument();
  });

  it('opens Browse filtered to a category when it is clicked', async () => {
    fakeKick({ [CATEGORIES]: () => page([rawCategory(7, 'Slots')]) });
    const onSelect = vi.fn();
    render(<CategoriesTab onSelectCategory={onSelect} />);

    await userEvent.click(await screen.findByText('Slots'));

    expect(onSelect).toHaveBeenCalledWith(7, 'Slots');
  });

  it('searches by name, on Kick, and shows only the results', async () => {
    const kick = fakeKick({
      [CATEGORIES]: (url) =>
        url.searchParams.get('name') === 'slo'
          ? page([rawCategory(1, 'Slots')])
          : page([rawCategory(1, 'Slots'), rawCategory(2, 'IRL')], 'p2'),
    });
    render(<CategoriesTab onSelectCategory={vi.fn()} />);
    await screen.findByText('IRL');

    await userEvent.type(screen.getByRole('searchbox'), 'slo{Enter}');

    await expect.poll(shownCategories).toEqual(['Slots']);
    expect(kick.requests.at(-1)?.searchParams.get('name')).toBe('slo');
    expect(kick.requests.at(-1)?.searchParams.has('cursor')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('says so when a search finds nothing', async () => {
    fakeKick({
      [CATEGORIES]: (url) => (url.searchParams.has('name') ? page([]) : page([rawCategory(1, 'IRL')])),
    });
    render(<CategoriesTab onSelectCategory={vi.fn()} />);
    await screen.findByText('IRL');

    await userEvent.type(screen.getByRole('searchbox'), 'zzz{Enter}');

    expect(await screen.findByText('No matching categories.')).toBeInTheDocument();
  });

  it('goes back to the full list when the search is cleared', async () => {
    fakeKick({
      [CATEGORIES]: (url) =>
        url.searchParams.has('name') ? page([rawCategory(1, 'Slots')]) : page([rawCategory(2, 'IRL')]),
    });
    render(<CategoriesTab onSelectCategory={vi.fn()} />);
    await screen.findByText('IRL');
    await userEvent.type(screen.getByRole('searchbox'), 'slo{Enter}');
    await screen.findByText('Slots');

    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    await expect.poll(shownCategories).toEqual(['IRL']);
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('clears unsubmitted text without asking Kick again', async () => {
    const kick = fakeKick({ [CATEGORIES]: () => page([rawCategory(2, 'IRL')]) });
    render(<CategoriesTab onSelectCategory={vi.fn()} />);
    await screen.findByText('IRL');

    await userEvent.type(screen.getByRole('searchbox'), 'typo');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(kick.requests).toHaveLength(1);
  });

  it('loads the next page of the full list, without repeating a category', async () => {
    fakeKick({
      [CATEGORIES]: (url) =>
        url.searchParams.get('cursor') === 'p2'
          ? page([rawCategory(2, 'IRL'), rawCategory(3, 'Music')])
          : page([rawCategory(1, 'Slots'), rawCategory(2, 'IRL')], 'p2'),
    });
    render(<CategoriesTab onSelectCategory={vi.fn()} />);
    await screen.findByText('IRL');

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await screen.findByText('Music');
    expect(shownCategories()).toEqual(['Slots', 'IRL', 'Music']);
  });

  it('ignores search results that arrive after the search was cleared', async () => {
    const kick = fakeKick({
      [CATEGORIES]: (url) =>
        url.searchParams.has('name') ? page([rawCategory(1, 'Stale result')]) : page([rawCategory(2, 'IRL')]),
    });
    render(<CategoriesTab onSelectCategory={vi.fn()} />);
    await screen.findByText('IRL');

    kick.hold(CATEGORIES);
    await userEvent.type(screen.getByRole('searchbox'), 'sta{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await screen.findByText('IRL');
    await kick.releaseHeld();

    expect(screen.queryByText('Stale result')).not.toBeInTheDocument();
    expect(shownCategories()).toEqual(['IRL']);
  });

  it('shows an error with a retry', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () =>
        fail
          ? Promise.reject(new TypeError('Failed to fetch'))
          : { ok: true, status: 200, json: async () => page([rawCategory(1, 'IRL')]) }
      )
    );
    render(<CategoriesTab onSelectCategory={vi.fn()} />);

    await screen.findByText('Network error — check your connection and try again.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('IRL')).toBeInTheDocument();
  });
});
