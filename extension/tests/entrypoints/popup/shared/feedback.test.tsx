// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBanner } from '@/entrypoints/popup/shared/feedback';
import { showMessageKeys } from '@/tests/support/i18n';

describe('ErrorBanner', () => {
  it('labels its retry button with a translated name', () => {
    showMessageKeys();
    render(<ErrorBanner message="m" onRetry={() => {}} />);

    expect(screen.getByRole('button', { name: '<common_retry>' })).toBeInTheDocument();
  });
});
