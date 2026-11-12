import { browser } from 'wxt/browser';
import { useState } from 'react';
import { i18n } from '#i18n';
import { toggleMuted, type TrackedChannel } from '@/lib/channels/tracked';
import type { ChannelStatus, LiveStatus, LiveStatusCache } from '@/lib/polling/live-status';
import { Card } from '../shared/layout';
import { Icon } from '../shared/Icon';
import { IconButton } from '../shared/controls';
import { LiveBadge, ViewerCount } from '../shared/stream';

function openChannel(slug: string) {
  browser.tabs.create({ url: `https://kick.com/${slug}` });
}

/**
 * Live channels first, most viewers first. Offline channels keep the order
 * they were added in: there is no viewer signal to sort on, and a stable order
 * keeps the collapsible section from reshuffling every poll.
 */
function partitionByLive(channels: TrackedChannel[], liveStatus: LiveStatusCache) {
  const liveOf = (c: TrackedChannel) => {
    const status = liveStatus[c.broadcasterUserId]?.status;
    return status?.kind === 'live' ? status : null;
  };
  const viewers = (c: TrackedChannel) => liveOf(c)?.viewerCount ?? 0;
  const isLive = (c: TrackedChannel) => liveOf(c) !== null;
  return {
    live: channels.filter(isLive).sort((a, b) => viewers(b) - viewers(a)),
    offline: channels.filter((c) => !isLive(c)).sort((a, b) => a.addedAt - b.addedAt),
  };
}

export function ChannelLists({
  channels,
  liveStatus,
}: {
  channels: TrackedChannel[];
  liveStatus: LiveStatusCache;
}) {
  const { live, offline } = partitionByLive(channels, liveStatus);
  return (
    <>
      {live.length > 0 && (
        <ul className="space-y-2">
          <ChannelRows channels={live} liveStatus={liveStatus} />
        </ul>
      )}
      {offline.length > 0 && <OfflineGroup channels={offline} liveStatus={liveStatus} />}
    </>
  );
}

function ChannelRows({
  channels,
  liveStatus,
}: {
  channels: TrackedChannel[];
  liveStatus: LiveStatusCache;
}) {
  return channels.map((channel) => (
    <li key={channel.broadcasterUserId}>
      <ChannelRow channel={channel} status={liveStatus[channel.broadcasterUserId]} />
    </li>
  ));
}

function ChannelRow({
  channel,
  status,
}: {
  channel: TrackedChannel;
  status: ChannelStatus | undefined;
}) {
  return (
    <Card
      className="group flex cursor-pointer gap-3 p-3"
      onClick={() => openChannel(channel.slug)}
    >
      <ChannelThumbnail status={status?.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-extrabold">{channel.slug}</h3>
          <MuteButton channel={channel} />
        </div>
        {status?.status.kind === 'live' ? (
          <StreamDetails stream={status.status} />
        ) : (
          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted">
            {i18n.t('following.offline')}
          </p>
        )}
      </div>
    </Card>
  );
}

type LiveStream = Extract<LiveStatus, { kind: 'live' }>;

function ChannelThumbnail({ status }: { status: LiveStatus | undefined }) {
  const thumbnail = status?.kind === 'live' ? status.thumbnail : null;
  return (
    <div className="relative h-[72px] w-[104px] shrink-0 overflow-hidden rounded-xl bg-neutral-800">
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted">
          <Icon icon="tv-off" className="text-lg" />
        </div>
      )}
      {status?.kind === 'live' && <LiveBadge />}
    </div>
  );
}

function MuteButton({ channel }: { channel: TrackedChannel }) {
  const label = channel.muted ? i18n.t('following.unmute') : i18n.t('following.mute');
  return (
    <IconButton
      aria-label={`${label} ${channel.slug}`}
      aria-pressed={channel.muted}
      onClick={(e) => {
        e.stopPropagation();
        toggleMuted(channel.broadcasterUserId);
      }}
      className={channel.muted ? 'text-lime' : ''}
    >
      <Icon icon={channel.muted ? 'bell-off' : 'bell'} className="text-sm" />
    </IconButton>
  );
}

function StreamDetails({ stream }: { stream: LiveStream }) {
  return (
    <>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{stream.title}</p>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
        <ViewerCount count={stream.viewerCount} />
        {stream.category?.name && (
          <>
            <span>·</span>
            <span className="truncate">{stream.category.name}</span>
          </>
        )}
      </div>
    </>
  );
}

function OfflineGroup({
  channels,
  liveStatus,
}: {
  channels: TrackedChannel[];
  liveStatus: LiveStatusCache;
}) {
  // Collapsed by default: the point of surfacing offline is to reassure the
  // user their tracking is intact, not to distract from currently-live cards.
  const [expanded, setExpanded] = useState(false);
  const label =
    channels.length === 1
      ? i18n.t('following.offlineGroupOne')
      : i18n.t('following.offlineGroupOther', { count: String(channels.length) });

  return (
    <section className="mt-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded-xl px-1 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted transition hover:text-white"
      >
        <span>{label}</span>
        <span className="flex items-center gap-1">
          {expanded ? i18n.t('following.hideOffline') : i18n.t('following.showOffline')}
          <Icon icon={expanded ? 'chevron-up' : 'chevron-down'} className="text-sm" />
        </span>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-2">
          <ChannelRows channels={channels} liveStatus={liveStatus} />
        </ul>
      )}
    </section>
  );
}
