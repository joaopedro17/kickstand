// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { Icon } from '@/entrypoints/popup/shared/Icon';

describe('Icon', () => {
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
});
