// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveBadge, ViewerCount } from '@/entrypoints/popup/shared/stream';
import { showMessageKeys } from '@/tests/support/i18n';

describe('LiveBadge', () => {
  it('stays still by default, for tracked channels', () => {
    const { container } = render(<LiveBadge />);

    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('pulses when asked, for Browse cards', () => {
    const { container } = render(<LiveBadge animated />);

    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows a translated label', () => {
    showMessageKeys();
    render(<LiveBadge />);

    expect(screen.getByText('<common_live>')).toBeInTheDocument();
  });
});

describe('ViewerCount', () => {
  it('tells screen readers, in their language, what the count counts', () => {
    showMessageKeys();
    render(<ViewerCount count={1200} />);

    expect(screen.getByText('<common_viewers>')).toHaveClass('sr-only');
    expect(screen.getByText('1.2K')).toBeInTheDocument();
  });
});
