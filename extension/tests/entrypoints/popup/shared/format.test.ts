import { describe, it, expect } from 'vitest';
import { formatCount } from '@/entrypoints/popup/shared/format';

describe('formatCount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1_000, '1.0K'],
    [9_949, '9.9K'],
    [9_950, '10K'],
    [10_000, '10K'],
    [999_499, '999K'],
    [9_960, '10K'],
    [999_500, '1.0M'],
    [999_999, '1.0M'],
    [1_000_000, '1.0M'],
    [2_345_678, '2.3M'],
  ])('shows %i as %s', (n, shown) => {
    expect(formatCount(n)).toBe(shown);
  });
});
