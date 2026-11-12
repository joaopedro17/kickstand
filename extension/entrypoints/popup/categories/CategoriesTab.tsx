import { useState } from 'react';
import { i18n } from '#i18n';
import { fetchCategoryPage, searchCategories } from '@/lib/kick/api';
import { Card, EmptyState, Icon, IconButton } from '../shared/ui';
import type { Category } from '@/lib/kick/types';
import { PagedListBody } from '../shared/PagedListBody';
import { usePagedList, type FetchPage } from '../shared/usePagedList';

/**
 * Browsing pages through all categories; a search is answered in one page,
 * so it never offers "Load more".
 */
function categoriesFor(query: string | null): FetchPage<Category> {
  if (query === null) return fetchCategoryPage;
  return async (_cursor, accessToken) => ({
    items: await searchCategories(query, accessToken),
    nextCursor: null,
  });
}

export function CategoriesTab({
  onSelectCategory,
}: {
  onSelectCategory: (id: number, name: string) => void;
}) {
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const list = usePagedList(JSON.stringify(activeQuery), categoriesFor(activeQuery));

  function search(input: string) {
    const query = input.trim() || null;
    // Submitting the same search again refreshes it.
    if (query === activeQuery) list.reload();
    else setActiveQuery(query);
  }

  return (
    <div>
      <CategorySearch isSearching={activeQuery !== null} onSearch={search} />
      <PagedListBody
        list={list}
        skeleton={<CategoryGridSkeleton />}
        empty={
          <EmptyState
            icon="layout-grid"
            title={
              activeQuery !== null
                ? i18n.t('categories.emptyMatches')
                : i18n.t('categories.emptyAll')
            }
          />
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {list.items.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onOpen={() => onSelectCategory(category.id, category.name)}
            />
          ))}
        </div>
      </PagedListBody>
    </div>
  );
}

function CategorySearch({
  isSearching,
  onSearch,
}: {
  isSearching: boolean;
  onSearch: (input: string) => void;
}) {
  const [input, setInput] = useState('');

  function clear() {
    setInput('');
    if (isSearching) onSearch('');
  }

  return (
    <form
      className="mb-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-panel p-2 transition hover:border-white/20 focus-within:border-lime/70 focus-within:ring-2 focus-within:ring-lime/10"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(input);
      }}
    >
      <Icon icon="search" className="ml-1 text-base text-muted" />
      <label htmlFor="category-search" className="sr-only">
        {i18n.t('categories.searchPlaceholder')}
      </label>
      <input
        id="category-search"
        type="search"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={i18n.t('categories.searchPlaceholder')}
        className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-white outline-none placeholder:text-muted/70"
      />
      {(isSearching || input) && (
        <IconButton
          type="button"
          aria-label={i18n.t('categories.clearSearch')}
          onClick={clear}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-muted hover:bg-white/[0.08]"
        >
          <Icon icon="x" />
        </IconButton>
      )}
    </form>
  );
}

function CategoryCard({
  category,
  onOpen,
}: {
  category: Category;
  onOpen: () => void;
}) {
  return (
    <Card
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
            <Icon icon="image" className="text-2xl" />
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
