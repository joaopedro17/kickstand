// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fakeBackground } from '@/tests/support/fake-background';
import { LoginScreen } from '@/entrypoints/popup/login/LoginScreen';

describe('LoginScreen', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the background to log in and moves on when it succeeds', async () => {
    const { received } = fakeBackground({ login: async () => ({ success: true }) });
    const onLoggedIn = vi.fn();
    render(<LoginScreen onLoggedIn={onLoggedIn} />);

    await userEvent.click(screen.getByRole('button', { name: 'Log in with Kick' }));

    await expect.poll(() => onLoggedIn).toHaveBeenCalled();
    expect(received).toEqual([{ type: 'login' }]);
  });

  it('shows the reason a login failed and lets the user try again', async () => {
    fakeBackground({ login: async () => ({ success: false, error: 'cancelled' }) });
    const onLoggedIn = vi.fn();
    render(<LoginScreen onLoggedIn={onLoggedIn} />);

    await userEvent.click(screen.getByRole('button', { name: 'Log in with Kick' }));

    expect(await screen.findByText('Login was cancelled.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in with Kick' })).toBeEnabled();
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it('shows a generic error when the background does not answer', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockRejectedValue(new Error('No listeners'));
    render(<LoginScreen onLoggedIn={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Log in with Kick' }));

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });

  it('disables the button and says it is working while the login runs', async () => {
    fakeBackground({ login: () => new Promise(() => {}) });
    render(<LoginScreen onLoggedIn={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Log in with Kick' }));

    expect(await screen.findByRole('button', { name: 'Logging in…' })).toBeDisabled();
  });
});
