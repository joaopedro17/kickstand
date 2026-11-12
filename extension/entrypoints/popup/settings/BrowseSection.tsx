import { i18n } from '#i18n';
import type { Settings } from '@/lib/settings';
import { SettingToggle } from './Toggle';
import { SettingsSection } from './SettingsSection';

export function BrowseSection({ settings }: { settings: Settings }) {
  return (
    <SettingsSection
      id="browse-settings"
      icon="layout-grid"
      title={i18n.t('settings.browseTitle')}
      kicker={i18n.t('settings.browseKicker')}
    >
      <SettingToggle settings={settings} name="blurMature" label={i18n.t('settings.blurMatureToggle')} />
    </SettingsSection>
  );
}
