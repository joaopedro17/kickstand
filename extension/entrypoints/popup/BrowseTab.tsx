import { useEffect, useState } from 'react';
import { i18n } from '#i18n';
import { withAuthRetry } from '@/lib/auth';
import { fetchLivestreams, KickApiError } from '@/lib/kick-api';
import { translateErrorCode } from '@/lib/error-messages';
import type { KickLivestream } from '@/lib/types';
import {
  Card,
  EmptyState,
  ErrorBanner,
  GhostButton,
  Icon,
  LiveBadge,
  PrimaryButton,
  ViewerCount,
} from './components/ui';

// Kick's API returns livestreams oldest-first with no sort option, so a
// small page would mostly surface long-running low-viewer streams. Fetching
// a much bigger batch per page makes the client-side viewer-count sort
// actually representative of what's live right now.
const FETCH_LIMIT = 100;

export function BrowseTab({
  categoryId,
  categoryName,
  onClearCategory,
}: {
  categoryId?: number;
  categoryName?: string;
  onClearCategory?: () => void;
} = {}) {
  const [streams, setStreams] = useState<KickLivestream[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await withAuthRetry((accessToken) =>
        fetchLivestreams(
          {
            cursor: reset ? undefined : cursor ?? undefined,
            limit: FETCH_LIMIT,
            categoryId: categoryId ? [categoryId] : undefined,
          },
          accessToken
        )
      );
      if (!res) {
        setError(translateErrorCode('not_logged_in'));
        return;
      }
      setStreams((prev) => {
        const merged = reset ? res.data : [...prev, ...res.data];
        return [...merged].sort((a, b) => b.viewer_count - a.viewer_count);
      });
      setCursor(res.pagination.next_cursor);
    } catch (err) {
      setError(
        err instanceof KickApiError
          ? translateErrorCode(err.kind)
          : translateErrorCode('unknown')
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  function openStream(slug: string) {
    browser.tabs.create({ url: `https://kick.com/${slug}` });
  }

  return (
    <div>
      {categoryId && categoryName && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-lime/20 bg-lime/5 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 text-white">
            <Icon icon="lucide:filter" className="text-lime" />
            {i18n.t('browse.filteredByPrefix')}{' '}
            <span className="font-bold text-lime">{categoryName}</span>
          </span>
          {onClearCategory && (
            <GhostButton
              type="button"
              onClick={onClearCategory}
              className="min-h-8 px-2 py-0"
            >
              <Icon icon="lucide:x" className="text-sm" />
              {i18n.t('browse.clearFilter')}
            </GhostButton>
          )}
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={() => load(true)} />}

      {loading && streams.length === 0 && <StreamGridSkeleton />}

      {!loading && streams.length === 0 && !error && (
        <EmptyState icon="lucide:tv-off" title={i18n.t('browse.emptyLive')} />
      )}

      {streams.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {streams.map((stream) => (
            <StreamCard
              key={stream.id}
              stream={stream}
              onOpen={() => openStream(stream.channel.slug)}
            />
          ))}
        </div>
      )}

      {cursor && (
        <PrimaryButton
          onClick={() => load(false)}
          disabled={loading}
          className="mt-4 w-full"
        >
          {loading ? i18n.t('common.loading') : i18n.t('common.loadMore')}
        </PrimaryButton>
      )}
    </div>
  );
}

function StreamCard({
  stream,
  onOpen,
}: {
  stream: KickLivestream;
  onOpen: () => void;
}) {
  return (
    <Card
      interactive
      className="group cursor-pointer overflow-hidden"
      onClick={onOpen}
    >
      <div className="relative h-28 overflow-hidden bg-neutral-800">
        {stream.thumbnail ? (
          <img
            src={stream.thumbnail}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <Icon icon="lucide:tv" className="text-2xl" />
          </div>
        )}
        <LiveBadge animated />
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-extrabold">
            {stream.channel.slug}
          </h3>
          <span className="text-muted transition group-hover:text-lime">
            <Icon icon="lucide:external-link" className="text-sm" />
          </span>
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted" title={stream.title}>
          {stream.title || '—'}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
          <ViewerCount count={stream.viewer_count} />
          {stream.category?.name && (
            <span className="max-w-[55%] truncate rounded-lg bg-ink px-2 py-1">
              {stream.category.name}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function StreamGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-2xl border border-white/[0.06] bg-panel"
        >
          <div className="h-28 bg-white/[0.03]" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-2/3 rounded bg-white/[0.05]" />
            <div className="h-2 w-full rounded bg-white/[0.03]" />
            <div className="h-2 w-1/2 rounded bg-white/[0.03]" />
          </div>
        </div>
      ))}
    </div>
  );
}
