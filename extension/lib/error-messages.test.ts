import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { translateErrorCode } from './error-messages';

describe('translateErrorCode', () => {
  beforeEach(() => {
    vi.spyOn(browser.i18n, 'getMessage').mockImplementation(
      (messageName: string) => `[${messageName}]`
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('translates a known KickApiError kind', () => {
    expect(translateErrorCode('unauthorized')).toBe('[errors_unauthorized]');
  });

  it('translates a known AuthError code', () => {
    expect(translateErrorCode('cancelled')).toBe('[errors_cancelled]');
  });

  it('translates the rate-limited kind (hyphenated key)', () => {
    expect(translateErrorCode('rate-limited')).toBe('[errors_rate-limited]');
  });

  it('falls back to errors.unknown for an unrecognized code', () => {
    expect(translateErrorCode('some-code-nobody-defined')).toBe('[errors_unknown]');
  });
});
