import { useEffect, useState } from 'react';
import { i18n } from '#i18n';
import { logout } from '@/lib/auth';
import {
  settingsStorage,
  trackedChannelsStorage,
  type Settings,
  type TrackedChannel,
} from '@/lib/storage';
import {
  EmptyState,
  GhostButton,
  Icon,
  SectionHeader,
  Select,
} from './components/ui';

// Users who saved the retired 1.5-minute option before this UI shipped keep
// their polling behavior intact — the background alarm still honors any
// numeric value stored under pollingIntervalMinutes. Only the <select>
// coerces to a supported option so the dropdown never shows a blank slot.
const SUPPORTED_INTERVALS = [1, 2, 5] as const;

function normalizeInterval(minutes: number): number {
  return SUPPORTED_INTERVALS.includes(minutes as (typeof SUPPORTED_INTERVALS)[number])
    ? minutes
    : 1;
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [channels, setChannels] = useState<TrackedChannel[]>([]);

  useEffect(() => {
    settingsStorage.getValue().then(setSettings);
    trackedChannelsStorage.getValue().then(setChannels);
    const unwatchSettings = settingsStorage.watch(setSettings);
    const unwatchChannels = trackedChannelsStorage.watch(setChannels);
    return () => {
      unwatchSettings();
      unwatchChannels();
    };
  }, []);

  if (!settings) return null;

  async function updateInterval(minutes: number) {
    await settingsStorage.setValue({
      ...settings!,
      pollingIntervalMinutes: minutes,
    });
  }

  async function toggleNotifications() {
    await settingsStorage.setValue({
      ...settings!,
      notificationsEnabled: !settings!.notificationsEnabled,
    });
  }

  async function removeChannel(id: number) {
    await trackedChannelsStorage.setValue(
      channels.filter((c) => c.broadcasterUserId !== id)
    );
  }

  return (
    <div>
      <section
        className="mb-5 rounded-2xl border border-white/[0.06] bg-panel p-4 shadow-lg shadow-black/10"
        aria-labelledby="notifications-heading"
      >
        <SectionHeader
          icon="lucide:bell"
          title={i18n.t('settings.notificationsTitle')}
          kicker={i18n.t('settings.notificationsKicker')}
        />
        <label
          htmlFor="polling-interval"
          className="mb-2 block text-xs font-semibold text-muted"
        >
          {i18n.t('settings.pollingInterval')}
        </label>
        <Select
          id="polling-interval"
          value={normalizeInterval(settings.pollingIntervalMinutes)}
          onChange={(e) => updateInterval(Number(e.target.value))}
        >
          <option value={1}>{i18n.t('settings.every1Minute')}</option>
          <option value={2}>{i18n.t('settings.every2Minutes')}</option>
          <option value={5}>{i18n.t('settings.every5Minutes')}</option>
        </Select>

        <label
          htmlFor="live-notifications"
          className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-white transition hover:text-lime"
        >
          <input
            id="live-notifications"
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={toggleNotifications}
            className="h-4 w-4 cursor-pointer accent-[#b8f34a]"
          />
          <span>{i18n.t('settings.notifyToggle')}</span>
        </label>
      </section>

      <section
        className="mb-5 rounded-2xl border border-white/[0.06] bg-panel p-4 shadow-lg shadow-black/10"
        aria-labelledby="tracked-heading"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2
              id="tracked-heading"
              className="text-sm font-extrabold tracking-tight"
            >
              {i18n.t('settings.trackedChannels')}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {channels.length === 1
                ? i18n.t('settings.trackedCountOne')
                : i18n.t('settings.trackedCountOther', { count: String(channels.length) })}
            </p>
          </div>
          <span className="rounded-lg bg-lime/10 px-2 py-1 text-[10px] font-bold text-lime">
            {channels.length} {i18n.t('settings.totalBadge')}
          </span>
        </div>

        {channels.length === 0 ? (
          <EmptyState
            icon="lucide:list"
            title={i18n.t('settings.emptyTrackedTitle')}
            hint={i18n.t('settings.emptyTrackedHint')}
          />
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {channels.map((channel) => (
              <li
                key={channel.broadcasterUserId}
                className="flex min-h-12 items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <span className="truncate text-sm font-semibold">
                  {channel.slug}
                </span>
                <GhostButton
                  type="button"
                  onClick={() => removeChannel(channel.broadcasterUserId)}
                >
                  <Icon icon="lucide:x" className="text-sm" />
                  {i18n.t('common.remove')}
                </GhostButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={() => logout()}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-panel px-4 text-sm font-bold text-white transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 active:scale-95"
      >
        <Icon icon="lucide:log-out" className="text-base" />
        {i18n.t('settings.logout')}
      </button>
    </div>
  );
}
