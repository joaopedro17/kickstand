import { useEffect, useState } from 'react';
import { i18n } from '#i18n';
import { logout } from '@/lib/auth';
import {
  settingsStorage,
  trackedChannelsStorage,
  type Settings,
  type TrackedChannel,
} from '@/lib/storage';

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
    await settingsStorage.setValue({ ...settings!, pollingIntervalMinutes: minutes });
  }

  async function toggleNotifications() {
    await settingsStorage.setValue({
      ...settings!,
      notificationsEnabled: !settings!.notificationsEnabled,
    });
  }

  async function removeChannel(id: number) {
    await trackedChannelsStorage.setValue(channels.filter((c) => c.broadcasterUserId !== id));
  }

  return (
    <div>
      <h3>{i18n.t('settings.title')}</h3>

      <label>
        {i18n.t('settings.pollingInterval')}
        <select
          value={settings.pollingIntervalMinutes}
          onChange={(e) => updateInterval(Number(e.target.value))}
        >
          <option value={1}>{i18n.t('settings.every1Minute')}</option>
          <option value={1.5}>{i18n.t('settings.every1HalfMinutes')}</option>
        </select>
      </label>

      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={toggleNotifications}
          />
          {i18n.t('settings.notifyToggle')}
        </label>
      </div>

      <h4>{i18n.t('settings.trackedChannels')}</h4>
      {channels.map((channel) => (
        <div key={channel.broadcasterUserId} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{channel.slug}</span>
          <button onClick={() => removeChannel(channel.broadcasterUserId)}>
            {i18n.t('common.remove')}
          </button>
        </div>
      ))}

      <button onClick={() => logout()} style={{ marginTop: 12 }}>
        {i18n.t('settings.logout')}
      </button>
    </div>
  );
}
