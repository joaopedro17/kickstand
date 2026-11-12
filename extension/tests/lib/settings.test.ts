import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  DEFAULT_SETTINGS,
  isQuietTime,
  getSettings,
  parseSettings,
  updateSettings,
  watchSettings,
  type Settings,
} from '@/lib/settings';

describe('parseSettings', () => {
  it('gives the defaults for nothing stored', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps what an earlier version stored and fills in the rest', () => {
    expect(parseSettings({ notificationsEnabled: false })).toEqual({
      ...DEFAULT_SETTINGS,
      notificationsEnabled: false,
    });
  });

  it('defaults to a two-minute poll, with sound and category alerts off', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      notificationsEnabled: true,
      pollIntervalMinutes: 2,
      notifyCategoryChange: false,
      soundEnabled: false,
      blurMature: true,
      browseLanguage: null,
      quietHours: { enabled: false, startMinute: 22 * 60, endMinute: 7 * 60 },
    });
  });

  it('keeps every valid field as stored', () => {
    const stored: Settings = {
      notificationsEnabled: false,
      pollIntervalMinutes: 5,
      quietHours: { enabled: true, startMinute: 0, endMinute: 1439 },
      notifyCategoryChange: true,
      soundEnabled: true,
      blurMature: false,
      browseLanguage: 'pt',
    };
    expect(parseSettings(stored)).toEqual(stored);
  });

  it('replaces each invalid field with its default, keeping the valid ones', () => {
    expect(
      parseSettings({
        notificationsEnabled: 'yes',
        pollIntervalMinutes: 3,
        quietHours: { enabled: true, startMinute: 1440, endMinute: -1 },
        notifyCategoryChange: 1,
        soundEnabled: true,
        browseLanguage: '',
      })
    ).toEqual({
      ...DEFAULT_SETTINGS,
      quietHours: { ...DEFAULT_SETTINGS.quietHours, enabled: true },
      soundEnabled: true,
    });
  });

  it('accepts each allowed poll interval and nothing else', () => {
    for (const minutes of [1, 2, 5]) {
      expect(parseSettings({ pollIntervalMinutes: minutes }).pollIntervalMinutes).toBe(minutes);
    }
    for (const minutes of [0, 1.5, 10, '2']) {
      expect(parseSettings({ pollIntervalMinutes: minutes }).pollIntervalMinutes).toBe(2);
    }
  });

  it('rejects quiet-hour times that are not whole minutes of the day', () => {
    expect(parseSettings({ quietHours: { startMinute: 60.5, endMinute: '1' } }).quietHours).toEqual(
      DEFAULT_SETTINGS.quietHours
    );
    expect(parseSettings({ quietHours: 'night' }).quietHours).toEqual(DEFAULT_SETTINGS.quietHours);
  });
});

describe('settings storage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('reads the defaults before anything is saved', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('changes only the named fields', async () => {
    await updateSettings({ soundEnabled: true });
    await updateSettings({ pollIntervalMinutes: 1 });

    expect(await getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      soundEnabled: true,
      pollIntervalMinutes: 1,
    });
  });

  it('computes a change from the settings as stored, so quick changes all land', async () => {
    await Promise.all([
      updateSettings((s) => ({ quietHours: { ...s.quietHours, startMinute: 60 } })),
      updateSettings((s) => ({ quietHours: { ...s.quietHours, endMinute: 120 } })),
      updateSettings({ soundEnabled: true }),
    ]);

    expect(await getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      quietHours: { ...DEFAULT_SETTINGS.quietHours, startMinute: 60, endMinute: 120 },
      soundEnabled: true,
    });
  });

  it('tells a watcher about each change, with defaults filled in', async () => {
    const seen: Settings[] = [];
    const unwatch = watchSettings((s) => seen.push(s));

    await updateSettings({ blurMature: false });
    await expect.poll(() => seen.length).toBe(1);
    unwatch();
    await updateSettings({ blurMature: true });

    expect(seen).toEqual([{ ...DEFAULT_SETTINGS, blurMature: false }]);
  });
});

describe('isQuietTime', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 11, h, m);
  const quiet = (start: number, end: number, enabled = true) => ({
    enabled,
    startMinute: start * 60,
    endMinute: end * 60,
  });

  it('is quiet inside a window within the day, from its start up to but not including its end', () => {
    expect(isQuietTime(quiet(13, 15), at(12, 59))).toBe(false);
    expect(isQuietTime(quiet(13, 15), at(13))).toBe(true);
    expect(isQuietTime(quiet(13, 15), at(14, 59))).toBe(true);
    expect(isQuietTime(quiet(13, 15), at(15))).toBe(false);
  });

  it('handles a window that runs past midnight', () => {
    expect(isQuietTime(quiet(22, 7), at(21, 59))).toBe(false);
    expect(isQuietTime(quiet(22, 7), at(22))).toBe(true);
    expect(isQuietTime(quiet(22, 7), at(0))).toBe(true);
    expect(isQuietTime(quiet(22, 7), at(6, 59))).toBe(true);
    expect(isQuietTime(quiet(22, 7), at(7))).toBe(false);
  });

  it('is never quiet while turned off', () => {
    expect(isQuietTime(quiet(0, 23, false), at(12))).toBe(false);
  });

  it('is never quiet when the window starts and ends at the same time', () => {
    expect(isQuietTime(quiet(9, 9), at(9))).toBe(false);
    expect(isQuietTime(quiet(9, 9), at(3))).toBe(false);
  });
});
