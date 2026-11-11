import { browser } from 'wxt/browser';
import { useEffect, useState } from 'react';
import { i18n } from '#i18n';
import { withAuthRetry } from '@/lib/session-client';
import { resolveChannelsBySlug, KickApiError } from '@/lib/kick-api';
import { translateErrorCode } from '@/lib/error-messages';
import { sendRequest } from '@/lib/messages';
import { isStale } from '@/lib/poller';
import {
  addTracked,
  getTracked,
  isStorageFullError,
  MAX_TRACKED,
  toggleMuted,
  TrackedListFullError,
  watchTracked,
} from '@/lib/tracked-channels';
import {
  liveStatusStorage,
  type TrackedChannel,
  type LiveStatusCache,
  type ChannelStatus,
  type LiveStatus,
} from '@/lib/storage';
import {
  Card,
  EmptyState,
  Icon,
  IconButton,
  LiveBadge,
  PrimaryButton,
  TextInput,
  ViewerCount,
} from './components/ui';

function describeAddError(err: unknown): string {
  if (err instanceof TrackedListFullError) {
    return i18n.t('following.limitReached', { max: String(MAX_TRACKED) });
  }
  if (isStorageFullError(err)) return translateErrorCode('storage-full');
  return translateErrorCode(err instanceof KickApiError ? err.kind : 'unknown');
}

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

/** Resolves a slug with Kick and tracks the channel; returns an error message, or null on success. */
async function trackBySlug(slug: string): Promise<string | null> {
  const resolvedChannels = await withAuthRetry((accessToken) =>
    resolveChannelsBySlug([slug], accessToken)
  );
  if (!resolvedChannels) return translateErrorCode('not_logged_in');
  const [resolved] = resolvedChannels;
  if (!resolved) return i18n.t('following.channelNotFound', { slug });

  const outcome = await addTracked({
    broadcasterUserId: resolved.broadcaster_user_id,
    slug: resolved.slug,
    addedAt: Date.now(),
    muted: false,
  });
  if (outcome === 'already-tracked') return i18n.t('following.alreadyTracked', { slug });

  // The channel is tracked either way; a failed poll shows up as stale live
  // status, not as a failure to add.
  sendRequest({ type: 'poll-now' }).catch(() => {});
  return null;
}

function useAddChannel() {
  const [slugInput, setSlugInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function add() {
    const slug = slugInput.trim().toLowerCase();
    if (!slug) return;
    setAddError(null);
    setAdding(true);
    try {
      const error = await trackBySlug(slug);
      setAddError(error);
      if (!error) setSlugInput('');
    } catch (err) {
      setAddError(describeAddError(err));
    } finally {
      setAdding(false);
    }
  }

  return { slugInput, setSlugInput, addError, adding, add };
}

export function FollowingTab() {
  const { channels, liveStatus } = useTrackedChannels();

  return (
    <div>
      <AddChannelSection />
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

function AddChannelSection() {
  const { slugInput, setSlugInput, addError, adding, add } = useAddChannel();

  return (
    <section
      className="mb-5 rounded-2xl border border-lime/20 bg-panel p-3 shadow-lg shadow-black/10"
      aria-labelledby="add-channel-heading"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime/10 text-lime">
          <Icon icon="plus" className="text-base" />
        </span>
        <div>
          <h2 id="add-channel-heading" className="text-sm font-extrabold tracking-tight">
            {i18n.t('following.addChannelTitle')}
          </h2>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            {i18n.t('following.addChannelKicker')}
          </p>
        </div>
      </div>
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
          placeholder={i18n.t('following.slugPlaceholder')}
          autoComplete="off"
          spellCheck={false}
        />
        <PrimaryButton type="submit" disabled={adding || !slugInput.trim()}>
          <Icon icon="plus" className="text-base" />
          {adding ? i18n.t('following.addButtonLoading') : i18n.t('following.addButton')}
        </PrimaryButton>
      </form>
      <div className="mt-3 space-y-2 text-xs leading-5 text-muted">
        <p>{i18n.t('following.slugHelp1')}</p>
        <p>
          {i18n.t('following.slugHelp2Prefix')}{' '}
          <span className="font-semibold text-lime">xqc</span>.
        </p>
      </div>
      {addError && (
        <p className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {addError}
        </p>
      )}
    </section>
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
      interactive
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
