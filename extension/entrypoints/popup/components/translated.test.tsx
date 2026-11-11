// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ErrorBanner, LiveBadge, ViewerCount } from './ui';
import { Header } from './Header';

// Every visible word must come from the locale files. Here the fake browser
// answers with the message name itself, so a hard-coded English string
// shows up as plain text instead of <its_key>.
beforeEach(() => {
  vi.spyOn(fakeBrowser.i18n, 'getMessage').mockImplementation((name: string) => `<${name}>`);
});

describe('translated chrome', () => {
  it('labels the error banner retry button', () => {
    render(<ErrorBanner message="m" onRetry={() => {}} />);

    expect(screen.getByRole('button', { name: '<common_retry>' })).toBeInTheDocument();
  });

  it('labels the live badge', () => {
    render(<LiveBadge />);

    expect(screen.getByText('<common_live>')).toBeInTheDocument();
  });

  it('tells screen readers what the viewer count counts', () => {
    render(<ViewerCount count={1200} />);

    expect(screen.getByText('<common_viewers>')).toHaveClass('sr-only');
    expect(screen.getByText('1.2K')).toBeInTheDocument();
  });

  it('labels the main navigation', () => {
    render(
      <Header
        activeTab="following"
        onChange={() => {}}
        onProfileClick={() => {}}
        avatarUrl={null}
        settingsOpen={false}
      />
    );

    expect(screen.getByRole('navigation', { name: '<app_primaryNav>' })).toBeInTheDocument();
  });
});
