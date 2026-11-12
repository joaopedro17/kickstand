import { browser } from 'wxt/browser';
import { i18n } from '#i18n';
import { fetchLivestreams } from '@/lib/kick/api';
import type { Livestream } from '@/lib/kick/types';
import { Card } from '../shared/layout';
import { EmptyState } from '../shared/feedback';
import { GhostButton, IconButton } from '../shared/controls';
import { Icon } from '../shared/Icon';
import { LiveBadge, ViewerCount } from '../shared/stream';
import { PagedListBody } from '../shared/PagedListBody';
import { usePagedList } from '../shared/usePagedList';
import { trackChannels, useTracked } from '../shared/track';
import { useSettings } from '../shared/useSettings';
import { useState } from 'react';
import { hideCategory, hideChannel, isShown } from '@/lib/browse-hidden';
import { useHidden } from '../shared/useHidden';
import { updateSettings } from '@/lib/settings';

// Kick's API returns livestreams oldest-first with no sort option, so a
// small page would mostly surface long-running low-viewer streams. Fetching
// a much bigger batch per page makes the client-side viewer-count sort
// actually representative of what's live right now.
const FETCH_LIMIT = 100;

const byViewersDesc = (page: Livestream[]) =>
  [...page].sort((a, b) => b.viewerCount - a.viewerCount);

function openStream(slug: string) {
  browser.tabs.create({ url: `https://kick.com/${slug}` });
}

/** Languages offered in the filter: the ones most Kick streams use. */
const LANGUAGES = ['en', 'es', 'pt', 'fr', 'de', 'it', 'pl', 'sv', 'tr', 'ru', 'ar'];

function LanguageFilter({ value }: { value: string | null }) {
  const names = new Intl.DisplayNames([browser.i18n.getUILanguage()], { type: 'language' });
  return (
    <label className="mb-3 flex items-center justify-end gap-2 text-xs text-muted">
      {i18n.t('browse.language')}
      <select
        value={value ?? ''}
        onChange={(e) => updateSettings({ browseLanguage: e.target.value || null })}
        className="rounded-lg border border-white/10 bg-ink px-2 py-1 text-white"
      >
        <option value="">{i18n.t('browse.allLanguages')}</option>
        {LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {names.of(code)}
          </option>
        ))}
      </select>
    </label>
  );
}

type BrowseProps = {
  categoryId?: number;
  categoryName?: string;
  onClearCategory?: () => void;
};

export function BrowseTab(props: BrowseProps = {}) {
  // The list waits for the settings, so its first request already carries
  // the remembered language.
  const settings = useSettings();
  if (!settings) return null;
  return (
    <div>
      {props.categoryId && props.categoryName && (
        <CategoryFilter name={props.categoryName} onClear={props.onClearCategory} />
      )}
      <LanguageFilter value={settings.browseLanguage} />
      <StreamList
        categoryId={props.categoryId}
        language={settings.browseLanguage}
        blurMature={settings.blurMature}
      />
    </div>
  );
}

function StreamList({
  categoryId,
  language,
  blurMature,
}: {
  categoryId?: number;
  language: string | null;
  blurMature: boolean;
}) {
  const list = usePagedList(
    `${categoryId ?? ''}|${language ?? ''}`,
    (cursor, accessToken) =>
      fetchLivestreams(
        {
          cursor,
          limit: FETCH_LIMIT,
          categoryId: categoryId ? [categoryId] : undefined,
          language: language ?? undefined,
        },
        accessToken
      ),
    byViewersDesc
  );
  const trackedIds = new Set(useTracked().map((c) => c.broadcasterUserId));
  const hidden = useHidden();
  // Filtered as shown rather than as loaded, so hiding and showing again
  // take effect at once on what is already on screen.
  const visible = list.items.filter((stream) => isShown(stream, hidden));

  return (
    <PagedListBody
      list={{ ...list, items: visible }}
      skeleton={<StreamGridSkeleton />}
      empty={<EmptyState icon="tv-off" title={i18n.t('browse.emptyLive')} />}
    >
      <div className="grid grid-cols-2 gap-2">
        {visible.map((stream) => (
          <StreamCard
            key={stream.id}
            stream={stream}
            tracked={trackedIds.has(stream.broadcaster.id)}
            blurred={blurMature && stream.hasMatureContent}
            onOpen={() => openStream(stream.slug)}
          />
        ))}
      </div>
    </PagedListBody>
  );
}

function CategoryFilter({ name, onClear }: { name: string; onClear?: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-lime/20 bg-lime/5 px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5 text-white">
        <Icon icon="filter" className="text-lime" />
        {i18n.t('browse.filteredByPrefix')} <span className="font-bold text-lime">{name}</span>
      </span>
      {onClear && (
        <GhostButton type="button" onClick={onClear} className="min-h-8 px-2 py-0">
          <Icon icon="x" className="text-sm" />
          {i18n.t('browse.clearFilter')}
        </GhostButton>
      )}
    </div>
  );
}

/** A button that opens the choice of hiding this channel, or its category, from Browse. */
function HideMenu({ stream }: { stream: Livestream }) {
  const [open, setOpen] = useState(false);
  const { slug, category } = stream;
  const choices = [
    { name: slug, hide: () => hideChannel({ id: stream.broadcaster.id, slug }) },
    ...(category ? [{ name: category.name, hide: () => hideCategory(category) }] : []),
  ];
  return (
    <div className="relative">
      <IconButton
        type="button"
        aria-label={i18n.t('browse.hideOptions', { slug })}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon icon="eye-off" className="text-sm" />
      </IconButton>
      {open && (
        <div className="absolute right-0 top-6 z-10 w-36 rounded-xl border border-white/10 bg-ink p-1 shadow-lg">
          {choices.map((choice) => (
            <button
              key={choice.name}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                choice.hide().catch(() => {});
              }}
              className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-white hover:bg-white/10"
            >
              {i18n.t('browse.hide', { name: choice.name })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TrackButton({ stream, tracked }: { stream: Livestream; tracked: boolean }) {
  const { slug } = stream;
  return (
    <IconButton
      type="button"
      disabled={tracked}
      aria-label={tracked ? i18n.t('browse.tracked', { slug }) : i18n.t('browse.track', { slug })}
      onClick={(e) => {
        e.stopPropagation();
        trackChannels([{ broadcasterUserId: stream.broadcaster.id, slug }]).catch(() => {});
      }}
      className={tracked ? 'text-lime disabled:opacity-100' : ''}
    >
      <Icon icon={tracked ? 'check' : 'plus'} className="text-sm" />
    </IconButton>
  );
}

function StreamCard({
  stream,
  tracked,
  blurred,
  onOpen,
}: {
  stream: Livestream;
  tracked: boolean;
  /** A mature stream's thumbnail, hidden behind a blur. */
  blurred: boolean;
  onOpen: () => void;
}) {
  return (
    <Card
      className="group cursor-pointer overflow-hidden"
      onClick={onOpen}
    >
      <div className="relative h-28 overflow-hidden bg-neutral-800">
        {stream.thumbnail ? (
          <img
            src={stream.thumbnail}
            alt=""
            className={
              blurred
                ? 'h-full w-full scale-110 object-cover blur-xl'
                : 'h-full w-full object-cover transition duration-300 group-hover:scale-105'
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <Icon icon="tv" className="text-2xl" />
          </div>
        )}
        <LiveBadge animated />
        {blurred && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
            {i18n.t('browse.mature')}
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-extrabold">
            {stream.slug}
          </h3>
          <span className="flex items-center gap-1">
            <HideMenu stream={stream} />
            <TrackButton stream={stream} tracked={tracked} />
          </span>
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted" title={stream.title}>
          {stream.title || '—'}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
          <ViewerCount count={stream.viewerCount} />
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
