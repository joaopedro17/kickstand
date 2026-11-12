import { browser } from 'wxt/browser';
import { useEffect, useState, type ClipboardEvent } from 'react';
import { i18n } from '#i18n';
import { withAuthRetry } from '@/lib/auth/client';
import { resolveChannelsBySlug } from '@/lib/kick/api';
import { sendRequest } from '@/lib/messages';
import {
  isStale,
  type LiveStatusCache,
  type ChannelStatus,
  type LiveStatus,
} from '@/lib/polling/live-status';
import { getTracked, toggleMuted, watchTracked, type TrackedChannel } from '@/lib/channels/tracked';
import { slugFromKickUrl } from '@/lib/channels/slug-input';
import type { Channel } from '@/lib/kick/types';
import { trackChannels } from '../shared/track';
import { AddNotices, useSlugAdder } from '../shared/useSlugAdder';
import { liveStatusStorage } from '@/lib/polling/storage';
import { Card, SectionHeader } from '../shared/layout';
import { EmptyState, ErrorBanner } from '../shared/feedback';
import { Icon } from '../shared/Icon';
import { IconButton, PrimaryButton, TextInput } from '../shared/controls';
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

function useTrackedChannels() {
  const [channels, setChannels] = useState<TrackedChannel[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatusCache>({});

  useEffect(() => {
    Promise.all([getTracked(), liveStatusStorage.getValue()]).then(([tracked, status]) => {
      setChannels(tracked);
      setLiveStatus(status);
      if (isStale(tracked, status, Date.now())) sendRequest({ type: 'poll-now' }).catch(() => {});
    });
    const unwatchChannels = watchTracked(setChannels);
    const unwatchStatus = liveStatusStorage.watch(setLiveStatus);
    return () => {
      unwatchChannels();
      unwatchStatus();
    };
  }, []);

  return { channels, liveStatus };
}

/**
 * A single-line input drops the line breaks of pasted text, gluing a pasted
 * list into one word. Pasted line breaks become spaces instead.
 */
function pasteOnOneLine(e: ClipboardEvent<HTMLInputElement>, setValue: (value: string) => void) {
  const text = e.clipboardData.getData('text');
  if (!/[\r\n]/.test(text)) return;
  e.preventDefault();
  const { value, selectionStart, selectionEnd } = e.currentTarget;
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? value.length;
  setValue(value.slice(0, start) + text.replace(/[\r\n]+/g, ' ') + value.slice(end));
}

/** The channel the current tab shows, when it is one Kick knows and the user doesn't track yet. */
function useCurrentTabChannel(tracked: TrackedChannel[]): Channel | null {
  const [channel, setChannel] = useState<Channel | null>(null);

  useEffect(() => {
    async function lookUp() {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const slug = slugFromKickUrl(tab?.url);
      if (!slug || (await getTracked()).some((c) => c.slug === slug)) return;
      const found = await withAuthRetry((accessToken) => resolveChannelsBySlug([slug], accessToken));
      setChannel(found?.[0] ?? null);
    }
    // Only an offer: if anything fails, it just isn't shown.
    lookUp().catch(() => {});
  }, []);

  const isTracked = tracked.some((c) => c.broadcasterUserId === channel?.broadcasterUserId);
  return isTracked ? null : channel;
}

export function FollowingTab() {
  const { channels, liveStatus } = useTrackedChannels();

  const pollFailed = Object.values(liveStatus).some((entry) => entry.lastError);

  return (
    <div>
      {pollFailed && (
        <ErrorBanner
          message={i18n.t('following.refreshFailed')}
          onRetry={() => sendRequest({ type: 'poll-now' }).catch(() => {})}
        />
      )}
      <AddChannelSection tracked={channels} />
      {channels.length === 0 ? (
        <EmptyState
          icon="radio"
          title={i18n.t('following.emptyState')}
          hint={i18n.t('following.emptyStateHint')}
        />
      ) : (
        <ChannelLists channels={channels} liveStatus={liveStatus} />
      )}
    </div>
  );
}

function AddChannelSection({ tracked }: { tracked: TrackedChannel[] }) {
  const { text: slugInput, setText: setSlugInput, notices, adding, add } = useSlugAdder();
  const tabChannel = useCurrentTabChannel(tracked);

  return (
    <section
      className="mb-5 rounded-2xl border border-lime/20 bg-panel p-3 shadow-lg shadow-black/10"
      aria-labelledby="add-channel-heading"
    >
      <SectionHeader
        icon="plus"
        title={i18n.t('following.addChannelTitle')}
        headingId="add-channel-heading"
        kicker={i18n.t('following.addChannelKicker')}
      />
      {tabChannel && <TrackTabChannel channel={tabChannel} />}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="channel-slug" className="sr-only">
          {i18n.t('following.slugPlaceholder')}
        </label>
        <TextInput
          id="channel-slug"
          name="channel-slug"
          type="text"
          value={slugInput}
          onChange={(e) => setSlugInput(e.target.value)}
          onPaste={(e) => pasteOnOneLine(e, setSlugInput)}
          placeholder={i18n.t('following.slugPlaceholder')}
          autoComplete="off"
          spellCheck={false}
        />
        <PrimaryButton type="submit" disabled={adding || !slugInput.trim()}>
          <Icon icon="plus" className="text-base" />
          {adding ? i18n.t('following.addButtonLoading') : i18n.t('following.addButton')}
        </PrimaryButton>
      </form>
      <p className="mt-3 text-xs leading-5 text-muted">{i18n.t('following.addHelp')}</p>
      <AddNotices notices={notices} />
    </section>
  );
}

function TrackTabChannel({ channel }: { channel: Channel }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-lime/20 bg-lime/5 px-3 py-2 text-xs">
      <span className="text-muted">{i18n.t('following.currentTabHint')}</span>
      <PrimaryButton type="button" onClick={() => trackChannels([channel]).catch(() => {})} className="min-h-8 px-3">
        <Icon icon="plus" className="text-sm" />
        {i18n.t('following.trackCurrentTab', { slug: channel.slug })}
      </PrimaryButton>
    </div>
  );
}

function ChannelLists({
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
