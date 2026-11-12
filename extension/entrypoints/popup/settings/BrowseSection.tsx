import { i18n } from '#i18n';
import type { Settings } from '@/lib/settings';
import { SettingToggle } from './Toggle';
import { SettingsSection } from './SettingsSection';
import { showCategory, showChannel } from '@/lib/browse-hidden';
import { useHidden } from '../shared/useHidden';
import { GhostButton } from '../shared/controls';
import { Icon } from '../shared/Icon';

function HiddenList() {
  const hidden = useHidden();
  const items = [
    ...hidden.channels.map((c) => ({ key: `channel-${c.id}`, name: c.slug, show: () => showChannel(c.id) })),
    ...hidden.categories.map((c) => ({ key: `category-${c.id}`, name: c.name, show: () => showCategory(c.id) })),
  ];
  return (
    <div className="mt-4">
      <h3 className="text-xs font-bold text-white">{i18n.t('settings.hiddenTitle')}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-muted">{i18n.t('settings.hiddenNone')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/[0.06]">
          {items.map((item) => (
            <li key={item.key} className="flex min-h-10 items-center justify-between gap-3 py-1.5">
              <span className="truncate text-sm">{item.name}</span>
              <GhostButton
                type="button"
                aria-label={i18n.t('settings.showAgain', { name: item.name })}
                onClick={() => item.show().catch(() => {})}
              >
                <Icon icon="eye" className="text-sm" />
              </GhostButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BrowseSection({ settings }: { settings: Settings }) {
  return (
    <SettingsSection
      id="browse-settings"
      icon="layout-grid"
      title={i18n.t('settings.browseTitle')}
      kicker={i18n.t('settings.browseKicker')}
    >
      <SettingToggle settings={settings} name="blurMature" label={i18n.t('settings.blurMatureToggle')} />
      <HiddenList />
    </SettingsSection>
  );
}
