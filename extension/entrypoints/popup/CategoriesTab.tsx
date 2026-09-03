import { useEffect, useState } from 'react';
import { i18n } from '#i18n';
import { withAuthRetry } from '@/lib/auth';
import { fetchCategories, KickApiError } from '@/lib/kick-api';
import { translateErrorCode } from '@/lib/error-messages';
import type { KickCategoryWithTags } from '@/lib/types';
import {
  Card,
  EmptyState,
  ErrorBanner,
  Icon,
  IconButton,
  PrimaryButton,
} from './components/ui';

// A single load() drives both modes:
//   - activeQuery === null → browse (paginated via cursor)
//   - activeQuery === string → server-side search via name[]= (no cursor,
//     Kick's search endpoint returns a single page)
export function CategoriesTab({
  onSelectCategory,
}: {
  onSelectCategory: (id: number, name: string) => void;
}) {
  const [categories, setCategories] = useState<KickCategoryWithTags[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [activeQuery, setActiveQuery] = useState<string | null>(null);

  async function load(
    reset: boolean,
    override?: { query: string | null }
  ) {
    // Resolve mode from override → local state on the very first call, so a
    // submit and its state update don't race the fetch.
    const query = override ? override.query : activeQuery;
    setLoading(true);
    setError(null);
    try {
      const res = await withAuthRetry((accessToken) =>
        fetchCategories(
          {
            cursor: reset || query !== null ? undefined : cursor ?? undefined,
            limit: 25,
            name: query ? [query] : undefined,
          },
          accessToken
        )
      );
      if (!res) {
        setError(translateErrorCode('not_logged_in'));
        return;
      }
      setCategories((prev) => (reset ? res.data : [...prev, ...res.data]));
      // Search mode returns everything in one page — pin cursor to null so
      // we never fall into paginate-then-search-then-paginate confusion.
      setCursor(query !== null ? null : res.pagination.next_cursor);
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
  }, []);

  function submitSearch() {
    const q = queryInput.trim();
    const next = q.length > 0 ? q : null;
    setActiveQuery(next);
    load(true, { query: next });
  }

  function clearSearch() {
    if (activeQuery === null && queryInput === '') return;
    setQueryInput('');
    setActiveQuery(null);
    load(true, { query: null });
  }

  const isSearching = activeQuery !== null;

  return (
    <div>
      <form
        className="mb-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-panel p-2 transition hover:border-white/20 focus-within:border-lime/70 focus-within:ring-2 focus-within:ring-lime/10"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submitSearch();
        }}
      >
        <Icon icon="lucide:search" className="ml-1 text-base text-muted" />
        <label htmlFor="category-search" className="sr-only">
          {i18n.t('categories.searchPlaceholder')}
        </label>
        <input
          id="category-search"
          type="search"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder={i18n.t('categories.searchPlaceholder')}
          className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-white outline-none placeholder:text-muted/70"
        />
        {(isSearching || queryInput) && (
          <IconButton
            type="button"
            aria-label={i18n.t('categories.clearSearch')}
            onClick={clearSearch}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-muted hover:bg-white/[0.08]"
          >
            <Icon icon="lucide:x" />
          </IconButton>
        )}
      </form>

      {error && <ErrorBanner message={error} onRetry={() => load(true)} />}

      {loading && categories.length === 0 && <CategoryGridSkeleton />}

      {!loading && categories.length === 0 && !error && (
        <EmptyState
          icon="lucide:layout-grid"
          title={
            isSearching
              ? i18n.t('categories.emptyMatches')
              : i18n.t('categories.emptyAll')
          }
        />
      )}

      {categories.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onOpen={() => onSelectCategory(category.id, category.name)}
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

function CategoryCard({
  category,
  onOpen,
}: {
  category: KickCategoryWithTags;
  onOpen: () => void;
}) {
  return (
    <Card
      interactive
      className="group cursor-pointer overflow-hidden"
      onClick={onOpen}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-neutral-800">
        {category.thumbnail ? (
          <img
            src={category.thumbnail}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <Icon icon="lucide:image" className="text-2xl" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-2">
          <h3 className="truncate text-sm font-extrabold text-white drop-shadow">
            {category.name}
          </h3>
          {category.tags.length > 0 && (
            <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-lime">
              {category.tags.slice(0, 2).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function CategoryGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[3/4] animate-pulse rounded-2xl border border-white/[0.06] bg-panel"
        />
      ))}
    </div>
  );
}
