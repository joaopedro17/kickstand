import { browser } from 'wxt/browser';
import { useEffect, useState, type ClipboardEvent } from 'react';
import { i18n } from '#i18n';
import { withAuthRetry } from '@/lib/auth/client';
import { resolveChannelsBySlug } from '@/lib/kick/api';
import { sendRequest } from '@/lib/messages';
import { isStale, type LiveStatusCache } from '@/lib/polling/live-status';
import { getTracked, watchTracked, type TrackedChannel } from '@/lib/channels/tracked';
import { slugFromKickUrl } from '@/lib/channels/slug-input';
import type { Channel } from '@/lib/kick/types';
import { trackChannels } from '../shared/track';
import { AddNotices, useSlugAdder } from '../shared/useSlugAdder';
import { ChannelLists } from './ChannelList';
import { liveStatusStorage } from '@/lib/polling/storage';
import { SectionHeader } from '../shared/layout';
import { EmptyState, ErrorBanner } from '../shared/feedback';
import { Icon } from '../shared/Icon';
import { IconButton, PrimaryButton, TextInput } from '../shared/controls';

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

/** How often the "Updated … ago" label is recomputed while the popup is open. */
const CLOCK_TICK_MS = 30_000;

function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function updatedLabel(checkedAt: number, now: number): string {
  const minutes = Math.floor((now - checkedAt) / 60_000);
  return minutes < 1
    ? i18n.t('following.updatedJustNow')
    : i18n.t('following.updatedMinutesAgo', { count: String(minutes) });
}

/** When live status was last checked, and a button to check again. */
function Freshness({ liveStatus }: { liveStatus: LiveStatusCache }) {
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);
  const checks = Object.values(liveStatus).map((entry) => entry.lastCheckedAt);
  if (checks.length === 0) return null;

  function refresh() {
    setRefreshing(true);
    sendRequest({ type: 'poll-now' })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }

  return (
    <div className="mb-2 flex items-center justify-end gap-2 text-[11px] text-muted">
      <span>{updatedLabel(Math.max(...checks), now)}</span>
      <IconButton
        type="button"
        aria-label={i18n.t('following.refresh')}
        disabled={refreshing}
        onClick={refresh}
      >
        <Icon icon="refresh" className={refreshing ? 'animate-spin text-sm' : 'text-sm'} />
      </IconButton>
    </div>
  );
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
        <>
          <Freshness liveStatus={liveStatus} />
          <ChannelLists channels={channels} liveStatus={liveStatus} />
        </>
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
