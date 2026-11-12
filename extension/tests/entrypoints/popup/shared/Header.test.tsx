// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '@/entrypoints/popup/shared/Header';
import { showMessageKeys } from '@/tests/support/i18n';

function renderHeader() {
  render(
    <Header
      activeTab="following"
      onChange={() => {}}
      onProfileClick={() => {}}
      avatarUrl={null}
      settingsOpen={false}
    />
  );
}

describe('Header', () => {
  it('shows a settings icon, not an emoji, in place of a missing avatar', () => {
    renderHeader();

    const button = screen.getByRole('button', { name: 'Settings' });
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button).not.toHaveTextContent('⚙');
  });

  it('labels the main navigation with a translated name', () => {
    showMessageKeys();
    renderHeader();

    expect(screen.getByRole('navigation', { name: '<app_primaryNav>' })).toBeInTheDocument();
  });
});
