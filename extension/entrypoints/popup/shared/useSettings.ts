import { useEffect, useState } from 'react';
import { getSettings, watchSettings, type Settings } from '@/lib/settings';

/** The settings, kept current as they change; null until first read. */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    getSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);
  return settings;
}
