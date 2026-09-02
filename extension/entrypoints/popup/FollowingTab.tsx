import { useEffect, useState } from 'react';
import { i18n } from '#i18n';
import { withAuthRetry } from '@/lib/auth';
import { resolveChannelsBySlug, KickApiError } from '@/lib/kick-api';
import { translateErrorCode } from '@/lib/error-messages';
import {
  trackedChannelsStorage,
  liveStatusStorage,
  type TrackedChannel,
  type LiveStatusCache,
  type LiveStatusEntry,
} from '@/lib/storage';
import {
  Card,
  EmptyState,
  Icon,
  IconButton,
  LiveBadge,
  PrimaryButton,
  SectionHeader,
  TextInput,
  ViewerCount,
} from './components/ui';

export function FollowingTab() {
  const [channels, setChannels] = useState<TrackedChannel[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatusCache>({});
  const [slugInput, setSlugInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    trackedChannelsStorage.getValue().then(setChannels);
    liveStatusStorage.getValue().then(setLiveStatus);
    const unwatchChannels = trackedChannelsStorage.watch(setChannels);
    const unwatchStatus = liveStatusStorage.watch(setLiveStatus);
    return () => {
      unwatchChannels();
      unwatchStatus();
    };
  }, []);

  async function handleAdd() {
    const slug = slugInput.trim().toLowerCase();
    if (!slug) return;
    setAddError(null);
    setAdding(true);
    try {
      const resolvedChannels = await withAuthRetry((accessToken) =>
        resolveChannelsBySlug([slug], accessToken)
      );
      if (!resolvedChannels) {
        setAddError(translateErrorCode('not_logged_in'));
        return;
      }
      const [resolved] = resolvedChannels;
      if (!resolved) {
        setAddError(i18n.t('following.channelNotFound', { slug }));
        return;
      }

      const current = await trackedChannelsStorage.getValue();
      if (current.some((c) => c.broadcasterUserId === resolved.broadcaster_user_id)) {
        setAddError(i18n.t('following.alreadyTracked', { slug }));
        return;
      }

      const updated: TrackedChannel[] = [
        ...current,
        {
          broadcasterUserId: resolved.broadcaster_user_id,
          slug: resolved.slug,
          addedAt: Date.now(),
          muted: false,
        },
      ];
      await trackedChannelsStorage.setValue(updated);
      setSlugInput('');
      await browser.runtime.sendMessage({ type: 'poll-now' });
    } catch (err) {
      setAddError(
        err instanceof KickApiError
          ? translateErrorCode(err.kind)
          : translateErrorCode('unknown')
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleMute(id: number) {
    const updated = channels.map((c) =>
      c.broadcasterUserId === id ? { ...c, muted: !c.muted } : c
    );
    await trackedChannelsStorage.setValue(updated);
  }

  function openChannel(slug: string) {
    browser.tabs.create({ url: `https://kick.com/${slug}` });
  }

  const sorted = [...channels].sort((a, b) => {
    const aLive = liveStatus[a.broadcasterUserId]?.isLive ?? false;
    const bLive = liveStatus[b.broadcasterUserId]?.isLive ?? false;
    if (aLive !== bLive) return aLive ? -1 : 1;
    const aViewers = liveStatus[a.broadcasterUserId]?.viewerCount ?? 0;
    const bViewers = liveStatus[b.broadcasterUserId]?.viewerCount ?? 0;
    return bViewers - aViewers;
  });

  return (
    <div>
      <section
        className="mb-5 rounded-2xl border border-lime/20 bg-panel p-3 shadow-lg shadow-black/10"
        aria-labelledby="add-channel-heading"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime/10 text-lime">
            <Icon icon="lucide:plus" className="text-base" />
          </span>
          <div>
            <h2
              id="add-channel-heading"
              className="text-sm font-extrabold tracking-tight"
            >
              Add a channel
            </h2>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Follow by exact slug
            </p>
          </div>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
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
            <Icon icon="lucide:plus" className="text-base" />
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

      {sorted.length === 0 ? (
        <EmptyState
          icon="lucide:radio"
          title={i18n.t('following.emptyState')}
          hint="Paste a slug above to start tracking."
        />
      ) : (
        <ul className="space-y-2">
          {sorted.map((channel) => (
            <li key={channel.broadcasterUserId}>
              <ChannelRow
                channel={channel}
                status={liveStatus[channel.broadcasterUserId]}
                onOpen={() => openChannel(channel.slug)}
                onToggleMute={() => handleToggleMute(channel.broadcasterUserId)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChannelRow({
  channel,
  status,
  onOpen,
  onToggleMute,
}: {
  channel: TrackedChannel;
  status: LiveStatusEntry | undefined;
  onOpen: () => void;
  onToggleMute: () => void;
}) {
  const live = status?.isLive ?? false;
  const muteLabel = channel.muted
    ? i18n.t('following.unmute')
    : i18n.t('following.mute');

  return (
    <Card
      interactive
      className="group flex cursor-pointer gap-3 p-3"
      onClick={onOpen}
    >
      <div className="relative h-[72px] w-[104px] shrink-0 overflow-hidden rounded-xl bg-neutral-800">
        {status?.thumbnail ? (
          <img
            src={status.thumbnail}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <Icon icon="lucide:tv-off" className="text-lg" />
          </div>
        )}
        {live && <LiveBadge />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-extrabold">{channel.slug}</h3>
          <IconButton
            aria-label={`${muteLabel} ${channel.slug}`}
            aria-pressed={channel.muted}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
            className={channel.muted ? 'text-lime' : ''}
          >
            <Icon
              icon={channel.muted ? 'lucide:bell-off' : 'lucide:bell'}
              className="text-sm"
            />
          </IconButton>
        </div>
        {live ? (
          <>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
              {status?.title || ''}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
              <ViewerCount count={status?.viewerCount ?? 0} />
              {status?.category?.name && (
                <>
                  <span>·</span>
                  <span className="truncate">{status.category.name}</span>
                </>
              )}
            </div>
          </>
        ) : (
          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted">
            Offline
          </p>
        )}
      </div>
    </Card>
  );
}
