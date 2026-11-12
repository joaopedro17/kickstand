import { describe, it, expect } from 'vitest';
import { chunk } from '@/lib/chunk';

describe('chunk', () => {
  it('splits an array into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when smaller than the size', () => {
    expect(chunk([1, 2], 100)).toEqual([[1, 2]]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], 10)).toEqual([]);
  });
});
