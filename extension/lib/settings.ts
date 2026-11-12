import { storage } from 'wxt/utils/storage';

export const POLL_INTERVALS = [1, 2, 5] as const;
export type PollIntervalMinutes = (typeof POLL_INTERVALS)[number];

const MINUTES_PER_DAY = 24 * 60;

/** Notifications are held back from `startMinute` to `endMinute`, minutes after local midnight; may span midnight. */
export interface QuietHours {
  enabled: boolean;
  startMinute: number;
  endMinute: number;
}

export interface Settings {
  notificationsEnabled: boolean;
  pollIntervalMinutes: PollIntervalMinutes;
  quietHours: QuietHours;
  notifyCategoryChange: boolean;
  soundEnabled: boolean;
  /** Clicking a notification focuses an open tab of the channel; needs the optional `tabs` permission. */
  focusExistingTab: boolean;
  blurMature: boolean;
  /** The language Browse was last filtered by; null for every language. */
  browseLanguage: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  pollIntervalMinutes: 2,
  quietHours: { enabled: false, startMinute: 22 * 60, endMinute: 7 * 60 },
  notifyCategoryChange: false,
  soundEnabled: false,
  focusExistingTab: false,
  blurMature: true,
  browseLanguage: null,
};

// Sync storage holds whatever any earlier version wrote, so nothing here
// trusts its shape: every read goes through parseSettings.
const settingsStorage = storage.defineItem<unknown>('sync:settings', { fallback: null });

type Fields = Record<string, unknown>;

function asFields(value: unknown): Fields {
  return typeof value === 'object' && value !== null ? (value as Fields) : {};
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function minuteOfDay(value: unknown, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < MINUTES_PER_DAY
    ? (value as number)
    : fallback;
}

function pollInterval(value: unknown): PollIntervalMinutes {
  return POLL_INTERVALS.find((m) => m === value) ?? DEFAULT_SETTINGS.pollIntervalMinutes;
}

function quietHours(value: unknown): QuietHours {
  const fields = asFields(value);
  const fallback = DEFAULT_SETTINGS.quietHours;
  return {
    enabled: bool(fields.enabled, fallback.enabled),
    startMinute: minuteOfDay(fields.startMinute, fallback.startMinute),
    endMinute: minuteOfDay(fields.endMinute, fallback.endMinute),
  };
}

function language(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Settings as stored by any version, with each missing or invalid field replaced by its default. */
export function parseSettings(stored: unknown): Settings {
  const fields = asFields(stored);
  const d = DEFAULT_SETTINGS;
  return {
    notificationsEnabled: bool(fields.notificationsEnabled, d.notificationsEnabled),
    pollIntervalMinutes: pollInterval(fields.pollIntervalMinutes),
    quietHours: quietHours(fields.quietHours),
    notifyCategoryChange: bool(fields.notifyCategoryChange, d.notifyCategoryChange),
    soundEnabled: bool(fields.soundEnabled, d.soundEnabled),
    focusExistingTab: bool(fields.focusExistingTab, d.focusExistingTab),
    blurMature: bool(fields.blurMature, d.blurMature),
    browseLanguage: language(fields.browseLanguage),
  };
}

/** Whether `when`, in local time, falls in the quiet hours. A window that starts where it ends is empty. */
export function isQuietTime(quiet: QuietHours, when: Date): boolean {
  if (!quiet.enabled) return false;
  const minute = when.getHours() * 60 + when.getMinutes();
  const { startMinute: start, endMinute: end } = quiet;
  return start <= end ? minute >= start && minute < end : minute >= start || minute < end;
}

export async function getSettings(): Promise<Settings> {
  return parseSettings(await settingsStorage.getValue());
}

type SettingsChange = Partial<Settings> | ((current: Settings) => Partial<Settings>);

// Updates in this context run one after another, each reading what the
// previous one wrote, so two quick changes can't overwrite each other.
let queue: Promise<unknown> = Promise.resolve();

/** Changes the named fields; a function computes them from the settings as stored. */
export function updateSettings(change: SettingsChange): Promise<void> {
  const run = queue.then(async () => {
    const current = await getSettings();
    const changes = typeof change === 'function' ? change(current) : change;
    await settingsStorage.setValue({ ...current, ...changes });
  });
  queue = run.catch(() => {});
  return run;
}

export function watchSettings(onChange: (settings: Settings) => void): () => void {
  return settingsStorage.watch((stored) => onChange(parseSettings(stored)));
}
