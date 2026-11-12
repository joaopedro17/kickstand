// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Icon } from '@/entrypoints/popup/shared/ui';
import { Header } from '@/entrypoints/popup/shared/Header';

describe('icons', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws an icon straight away as inline SVG, without any network request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<Icon icon="plus" className="text-base" />);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveClass('text-base');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sizes the icon to the surrounding text, like the font-size classes expect', () => {
    const { container } = render(<Icon icon="bell" />);

    expect(container.querySelector('svg')).toHaveAttribute('width', '1em');
  });

  it('shows a settings icon, not an emoji, in place of a missing avatar', () => {
    render(
      <Header
        activeTab="following"
        onChange={() => {}}
        onProfileClick={() => {}}
        avatarUrl={null}
        settingsOpen={false}
      />
    );

    const button = screen.getByRole('button', { name: 'Settings' });
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button).not.toHaveTextContent('⚙');
  });
});
