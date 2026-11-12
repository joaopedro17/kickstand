// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeBackground } from '@/tests/support/fake-background';
import { fakeKick, page, rawCategory, rawStream } from '@/tests/support/fake-kick';
import { authTokensStorage, profileStorage } from '@/lib/storage';
import App from './App';

const DAY = 24 * 60 * 60 * 1000;
const USERS = '/public/v1/users';

async function logIn() {
  await authTokensStorage.setValue({
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 60 * 60 * 1000,
    refreshExpiresAt: Date.now() + DAY,
  });
}

function kickWithProfile(picture = 'https://me.png') {
  return fakeKick({
    [USERS]: () => ({ data: [{ user_id: 1, profile_picture: picture }] }),
    '/public/v2/livestreams': () => page([rawStream(1, 10)]),
    '/public/v2/categories': () => page([rawCategory(9, 'Slots')]),
  });
}

const settingsButton = () => screen.getByRole('button', { name: 'Settings' });
const tab = (name: string) =>
  within(screen.getByRole('navigation')).getByRole('button', { name });

describe('App', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    fakeBackground();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks a logged-out user to log in', async () => {
    kickWithProfile();
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Log in with Kick' })).toBeInTheDocument();
  });

  it('opens on the Following tab once logged in', async () => {
    await logIn();
    kickWithProfile();
    render(<App />);

    expect(await screen.findByRole('region', { name: 'Add a channel' })).toBeInTheDocument();
    expect(tab('Following')).toHaveAttribute('aria-current', 'page');
  });

  it('goes back to the login screen when the session ends', async () => {
    await logIn();
    kickWithProfile();
    render(<App />);
    await screen.findByRole('region', { name: 'Add a channel' });

    await authTokensStorage.setValue(null);

    expect(await screen.findByRole('button', { name: 'Log in with Kick' })).toBeInTheDocument();
  });

  it('switches tabs, and opens Browse filtered when a category is picked', async () => {
    await logIn();
    const kick = kickWithProfile();
    render(<App />);
    await screen.findByRole('region', { name: 'Add a channel' });

    await userEvent.click(tab('Categories'));
    await userEvent.click(await screen.findByText('Slots'));

    expect(tab('Browse')).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('Slots')).toBeInTheDocument();
    expect(kick.requests.at(-1)?.searchParams.getAll('category_id')).toEqual(['9']);
  });

  it('drops the category filter when leaving Browse', async () => {
    await logIn();
    const kick = kickWithProfile();
    render(<App />);
    await screen.findByRole('region', { name: 'Add a channel' });
    await userEvent.click(tab('Categories'));
    await userEvent.click(await screen.findByText('Slots'));
    await screen.findByText('streamer1');

    await userEvent.click(tab('Following'));
    await userEvent.click(tab('Browse'));

    await screen.findByText('streamer1');
    expect(kick.requests.at(-1)?.searchParams.has('category_id')).toBe(false);
  });

  it('opens and closes settings from the profile button', async () => {
    await logIn();
    kickWithProfile();
    render(<App />);
    await screen.findByRole('region', { name: 'Add a channel' });

    await userEvent.click(settingsButton());
    expect(await screen.findByRole('region', { name: 'Notifications' })).toBeInTheDocument();
    expect(settingsButton()).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(settingsButton());
    expect(await screen.findByRole('region', { name: 'Add a channel' })).toBeInTheDocument();
  });

  it('closes settings when a tab is picked', async () => {
    await logIn();
    kickWithProfile();
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    await screen.findByRole('region', { name: 'Notifications' });

    await userEvent.click(tab('Following'));

    expect(await screen.findByRole('region', { name: 'Add a channel' })).toBeInTheDocument();
  });

  describe('profile picture', () => {
    it('shows the user’s Kick picture and remembers it', async () => {
      await logIn();
      kickWithProfile('https://me.png');
      render(<App />);

      await expect.poll(() => settingsButton().querySelector('img')?.src).toBe('https://me.png/');
      expect(await profileStorage.getValue()).toMatchObject({ avatarUrl: 'https://me.png' });
    });

    it('shows a remembered picture straight away, without asking Kick, for a day', async () => {
      await logIn();
      await profileStorage.setValue({ avatarUrl: 'https://cached.png', fetchedAt: Date.now() - DAY + 60_000 });
      const kick = kickWithProfile('https://new.png');
      render(<App />);

      await expect.poll(() => settingsButton().querySelector('img')?.src).toBe('https://cached.png/');
      await screen.findByRole('region', { name: 'Add a channel' });
      expect(kick.requests.filter((u) => u.pathname === USERS)).toHaveLength(0);
    });

    it('asks Kick again once the remembered picture is a day old', async () => {
      await logIn();
      await profileStorage.setValue({ avatarUrl: 'https://old.png', fetchedAt: Date.now() - DAY - 1 });
      kickWithProfile('https://new.png');
      render(<App />);

      await expect.poll(() => settingsButton().querySelector('img')?.src).toBe('https://new.png/');
    });

    it('keeps showing the old picture when the session cannot hand out a token', async () => {
      await logIn();
      await profileStorage.setValue({ avatarUrl: 'https://old.png', fetchedAt: 0 });
      fakeBackground({ 'get-access-token': async () => ({ status: 'logged-out' }) });
      kickWithProfile('https://new.png');
      render(<App />);

      await expect.poll(() => settingsButton().querySelector('img')?.src).toBe('https://old.png/');
    });

    it('keeps the settings icon when the picture cannot be fetched', async () => {
      await logIn();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      render(<App />);

      await screen.findByRole('region', { name: 'Add a channel' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(settingsButton().querySelector('img')).toBeNull();
      expect(settingsButton().querySelector('svg')).not.toBeNull();
    });
  });
});
