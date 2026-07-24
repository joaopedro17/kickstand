import { useEffect, useState } from 'react';
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
      <h3>Settings</h3>

      <label>
        Polling interval
        <select
          value={settings.pollingIntervalMinutes}
          onChange={(e) => updateInterval(Number(e.target.value))}
        >
          <option value={1}>Every 1 minute</option>
          <option value={1.5}>Every 1.5 minutes</option>
        </select>
      </label>

      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={toggleNotifications}
          />
          Notify when a tracked channel goes live
        </label>
      </div>

      <h4>Tracked channels</h4>
      {channels.map((channel) => (
        <div key={channel.broadcasterUserId} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{channel.slug}</span>
          <button onClick={() => removeChannel(channel.broadcasterUserId)}>Remove</button>
        </div>
      ))}

      <button onClick={() => logout()} style={{ marginTop: 12 }}>
        Log out
      </button>
    </div>
  );
}
