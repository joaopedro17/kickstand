import { describe, it, expect } from 'vitest';
import { translateErrorCode } from './error-messages';

describe('translateErrorCode', () => {
  it('translates a known KickApiError kind', () => {
    expect(translateErrorCode('unauthorized')).toBe(
      'Your session expired — please log in again.'
    );
  });

  it('translates a known AuthError code', () => {
    expect(translateErrorCode('cancelled')).toBe('Login was cancelled.');
  });

  it('translates the rate-limited kind (hyphenated key)', () => {
    expect(translateErrorCode('rate-limited')).toBe(
      'Kick is rate-limiting requests — please wait a moment and try again.'
    );
  });

  it('falls back to errors.unknown for an unrecognized code', () => {
    expect(translateErrorCode('some-code-nobody-defined')).toBe(
      'Something went wrong. Please try again.'
    );
  });
});
