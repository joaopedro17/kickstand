import { i18n } from '#i18n';
import { requestLogout } from '@/lib/auth/client';
import { removeTracked } from '@/lib/channels/tracked';
import { EmptyState } from '../shared/feedback';
import { GhostButton } from '../shared/controls';
import { Icon } from '../shared/Icon';
import { useTracked } from '../shared/track';
import { useSettings } from '../shared/useSettings';
import { NotificationsSection } from './NotificationsSection';
import { TransferSection } from './TransferSection';

export function SettingsPanel() {
  const settings = useSettings();
  const channels = useTracked();

  if (!settings) return null;

  async function removeChannel(id: number) {
    await removeTracked(id);
  }

  return (
    <div>
      <NotificationsSection settings={settings} />

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
            icon="list"
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
                  <Icon icon="x" className="text-sm" />
                  {i18n.t('common.remove')}
                </GhostButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TransferSection channels={channels} />

      <button
        type="button"
        onClick={() => requestLogout()}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-panel px-4 text-sm font-bold text-white transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 active:scale-95"
      >
        <Icon icon="log-out" className="text-base" />
        {i18n.t('settings.logout')}
      </button>
    </div>
  );
}
