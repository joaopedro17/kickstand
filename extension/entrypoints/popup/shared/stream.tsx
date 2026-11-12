import { i18n } from '#i18n';
import { formatCount } from './format';
import { Icon } from './Icon';

export function LiveBadge({ animated = false }: { animated?: boolean }) {
  return (
    <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
      {animated && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      )}
      {i18n.t('common.live')}
    </span>
  );
}

export function ViewerCount({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-1 text-lime">
      <Icon icon="eye" />
      {formatCount(count)}
      <span className="sr-only">{i18n.t('common.viewers')}</span>
    </span>
  );
}
