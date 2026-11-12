// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeBackground } from '@/tests/support/fake-background';
import type { Request } from '@/lib/messages';
import type { TrackedChannel } from '@/lib/storage';
import { getSettings } from '@/lib/settings';
import { getTracked, setTracked } from '@/lib/channels/tracked';
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
});
