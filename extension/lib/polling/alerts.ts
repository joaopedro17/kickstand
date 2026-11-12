import { browser } from 'wxt/browser';
import { type TrackedChannel, getTracked } from '@/lib/channels/tracked';
import type { LiveStatus, LiveStatusCache } from './live-status';

/** One notification id per channel: a newer alert replaces the channel's previous one. */
const NOTIFICATION_PREFIX = 'kickstand-live-';

// Dynamic import, not a static top-level one: WXT's entrypoint-scanning pass
// (which runs on every `wxt prepare`/`wxt build`, including from a clean
// `.wxt/` directory — e.g. a fresh clone or CI) directly executes the
// background entrypoint, and this module with it, via a module runner, and
// does so before `@wxt-dev/i18n`'s `#i18n` alias target has been written to
// disk. A static `import { i18n } from '#i18n'` here fails that scan with
// "Cannot find module '#i18n'" — reproduced against wxt@0.20.27 and
// wxt@0.21.4, so it's an upstream ordering issue. The popup is bundled
// through WXT's HTML pipeline instead, where the static import works.
async function getI18n() {
  return (await import('#i18n')).i18n;
}

type LiveEntry = Extract<LiveStatus, { kind: 'live' }>;

/** What an alert is about: a stream starting, or a running stream changing category. */
export type AlertKind = 'live' | 'switched';

async function alertText(kind: AlertKind, channel: TrackedChannel, stream: LiveEntry) {
  const i18n = await getI18n();
  const name = stream.broadcasterName || channel.slug;
  const count = stream.viewerCount.toLocaleString(browser.i18n.getUILanguage());
  const context = stream.category
    ? i18n.t('notifications.liveContext', { category: stream.category.name, count })
    : i18n.t('notifications.liveContextNoCategory', { count });
  const message = stream.title || i18n.t('notifications.liveDefaultMessage');
  return {
    title:
      kind === 'live'
        ? i18n.t('notifications.liveTitle', { slug: name })
        : i18n.t('notifications.switchedTitle', { name, category: stream.category?.name ?? '' }),
    // Firefox ignores contextMessage, so the line goes into the message there.
    ...(import.meta.env.FIREFOX
      ? { message: `${message}\n${context}` }
      : { message, contextMessage: context }),
  };
}

/** Shows an alert for each channel, all live in `status`. */
export async function notifyChannels(
  kind: AlertKind,
  channels: TrackedChannel[],
  status: LiveStatusCache
): Promise<void> {
  for (const channel of channels) {
    const entry = status[channel.broadcasterUserId];
    // Only channels live in this poll are passed in.
    if (entry.status.kind !== 'live') continue;
    await browser.notifications.create(`${NOTIFICATION_PREFIX}${channel.broadcasterUserId}`, {
      type: 'basic',
      iconUrl: entry.avatarUrl || browser.runtime.getURL('/icons/128.png'),
      ...(await alertText(kind, channel, entry.status)),
    });
  }
}

/** Opens the channel a live notification was about, and dismisses it. */
export async function openNotifiedChannel(notificationId: string): Promise<void> {
  if (!notificationId.startsWith(NOTIFICATION_PREFIX)) return;
  const id = Number(notificationId.slice(NOTIFICATION_PREFIX.length));
  const channel = (await getTracked()).find((c) => c.broadcasterUserId === id);
  if (channel) await browser.tabs.create({ url: `https://kick.com/${channel.slug}` });
  await browser.notifications.clear(notificationId);
}
