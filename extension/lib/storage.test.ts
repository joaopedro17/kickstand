import { describe, it, expect } from 'vitest';
import { diffLiveTransitions, type LiveStatusCache } from './storage';

function entry(isLive: boolean): LiveStatusCache[number] {
  return {
    isLive,
    viewerCount: 0,
    category: null,
    thumbnail: null,
    title: '',
    lastCheckedAt: Date.now(),
  };
}

describe('diffLiveTransitions', () => {
  it('flags a channel transitioning from offline to live', () => {
    const previous: LiveStatusCache = { 1: entry(false) };
    const next: LiveStatusCache = { 1: entry(true) };
    expect(diffLiveTransitions(previous, next)).toEqual([1]);
  });

  it('flags a channel with no previous entry that is now live', () => {
    const previous: LiveStatusCache = {};
    const next: LiveStatusCache = { 1: entry(true) };
    expect(diffLiveTransitions(previous, next)).toEqual([1]);
  });

  it('does not flag a channel that was already live', () => {
    const previous: LiveStatusCache = { 1: entry(true) };
    const next: LiveStatusCache = { 1: entry(true) };
    expect(diffLiveTransitions(previous, next)).toEqual([]);
  });

  it('does not flag a channel that is still offline', () => {
    const previous: LiveStatusCache = { 1: entry(false) };
    const next: LiveStatusCache = { 1: entry(false) };
    expect(diffLiveTransitions(previous, next)).toEqual([]);
  });

  it('does not flag a channel going live to offline', () => {
    const previous: LiveStatusCache = { 1: entry(true) };
    const next: LiveStatusCache = { 1: entry(false) };
    expect(diffLiveTransitions(previous, next)).toEqual([]);
  });
});
