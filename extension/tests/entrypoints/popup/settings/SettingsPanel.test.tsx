// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeBackground } from '@/tests/support/fake-background';
import type { Request } from '@/lib/messages';
import { type TrackedChannel, getTracked, setTracked } from '@/lib/channels/tracked';
import { getSettings } from '@/lib/settings';
import { fakeKick } from '@/tests/support/fake-kick';
import { SettingsPanel } from '@/entrypoints/popup/settings/SettingsPanel';

function tracked(id: number, slug: string): TrackedChannel {
  return { broadcasterUserId: id, slug, addedAt: id, muted: false };
}

describe('SettingsPanel', () => {
  let backgroundReceived: Request[];

  beforeEach(() => {
    fakeBrowser.reset();
    backgroundReceived = fakeBackground().received;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('turns live notifications off and back on', async () => {
    render(<SettingsPanel />);
    const toggle = await screen.findByRole('checkbox', {
      name: 'Notify when a tracked channel goes live',
    });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);
    await expect.poll(async () => (await getSettings()).notificationsEnabled).toBe(false);
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);
    await expect.poll(async () => (await getSettings()).notificationsEnabled).toBe(true);
  });

  it('names its sections for screen readers', async () => {
    render(<SettingsPanel />);

    expect(await screen.findByRole('region', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tracked channels' })).toBeInTheDocument();
  });

  it('lists the tracked channels with their count', async () => {
    await setTracked([tracked(1, 'alpha'), tracked(2, 'beta')]);
    render(<SettingsPanel />);

    expect(await screen.findByText('2 channels in your radar')).toBeInTheDocument();
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('uses the singular for one channel', async () => {
    await setTracked([tracked(1, 'alpha')]);
    render(<SettingsPanel />);

    expect(await screen.findByText('1 channel in your radar')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is tracked', async () => {
    render(<SettingsPanel />);

    expect(await screen.findByText('No channels tracked yet.')).toBeInTheDocument();
  });

  it('removes a channel', async () => {
    await setTracked([tracked(1, 'alpha'), tracked(2, 'beta')]);
    render(<SettingsPanel />);

    const row = (await screen.findByText('alpha')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: /remove/i }));

    await expect.poll(async () => (await getTracked()).map((c) => c.slug)).toEqual(['beta']);
    await expect.poll(() => screen.queryByText('alpha')).toBeNull();
  });

  it('asks the background to log out', async () => {
    render(<SettingsPanel />);

    await userEvent.click(await screen.findByRole('button', { name: /log out/i }));

    expect(backgroundReceived).toContainEqual({ type: 'logout' });
  });

  describe('moving the list between browsers', () => {
    it('copies the tracked channels to the clipboard, one per line', async () => {
      const user = userEvent.setup();
      await setTracked([tracked(1, 'alpha'), tracked(2, 'beta')]);
      render(<SettingsPanel />);

      await user.click(await screen.findByRole('button', { name: 'Copy list' }));

      expect(await navigator.clipboard.readText()).toBe('alpha\nbeta\n');
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });

    it('downloads the tracked channels as a text file, one per line', async () => {
      await setTracked([tracked(1, 'alpha'), tracked(2, 'beta')]);
      let saved: Blob | undefined;
      vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
        saved = blob as Blob;
        return 'blob:list';
      });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const clicked: HTMLAnchorElement[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this);
      });
      render(<SettingsPanel />);

      await userEvent.click(await screen.findByRole('button', { name: 'Download' }));

      expect(clicked).toHaveLength(1);
      expect(clicked[0].download).toBe('kickstand-channels.txt');
      expect(clicked[0].href).toBe('blob:list');
      expect(await saved?.text()).toBe('alpha\nbeta\n');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:list');
    });

    it('offers nothing to copy or download while no channel is tracked', async () => {
      render(<SettingsPanel />);

      expect(await screen.findByRole('button', { name: 'Copy list' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
    });

    it('imports a pasted list, and says what became of each channel', async () => {
      await setTracked([tracked(1, 'alpha')]);
      fakeKick({
        '/public/v1/channels': (url) => ({
          data: url.searchParams
            .getAll('slug')
            .filter((slug) => slug !== 'ghost')
            .map((slug, i) => ({ broadcaster_user_id: slug === 'alpha' ? 1 : 10 + i, slug })),
        }),
      });
      render(<SettingsPanel />);

      await userEvent.click(await screen.findByRole('textbox', { name: 'Channels to import' }));
      await userEvent.paste('alpha\nbeta\nhttps://kick.com/gamma\nghost\n');
      await userEvent.click(screen.getByRole('button', { name: 'Import' }));

      expect(await screen.findByText('Now tracking beta, gamma')).toBeInTheDocument();
      expect(screen.getByText('Already tracked: alpha')).toBeInTheDocument();
      expect(screen.getByText('No channel found for: ghost')).toBeInTheDocument();
      expect((await getTracked()).map((c) => c.slug)).toEqual(['alpha', 'beta', 'gamma']);
      expect(screen.getByRole('textbox', { name: 'Channels to import' })).toHaveValue('ghost');
      expect(backgroundReceived).toContainEqual({ type: 'poll-now' });
    });
  });
});
