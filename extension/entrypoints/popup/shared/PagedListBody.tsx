import type { ReactNode } from 'react';
import { i18n } from '#i18n';
import { ErrorBanner } from './feedback';
import { PrimaryButton } from './controls';

type PagedList = {
  items: unknown[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
};

/**
 * What a paged list shows in each state: the error with a retry, a skeleton
 * while the first page loads, the empty state, the items, and "Load more"
 * while Kick has more.
 */
export function PagedListBody({
  list,
  skeleton,
  empty,
  children,
}: {
  list: PagedList;
  skeleton: ReactNode;
  empty: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      {list.items.length > 0 ? children : <Placeholder list={list} skeleton={skeleton} empty={empty} />}
      {list.hasMore && <LoadMore list={list} />}
    </>
  );
}

/** Before any items: a skeleton while loading, the empty state once loaded, nothing after an error. */
function Placeholder({
  list,
  skeleton,
  empty,
}: {
  list: PagedList;
  skeleton: ReactNode;
  empty: ReactNode;
}) {
  if (list.loading) return skeleton;
  return list.error ? null : empty;
}

function LoadMore({ list }: { list: PagedList }) {
  return (
    <PrimaryButton onClick={list.loadMore} disabled={list.loading} className="mt-4 w-full">
      {list.loading ? i18n.t('common.loading') : i18n.t('common.loadMore')}
    </PrimaryButton>
  );
}
