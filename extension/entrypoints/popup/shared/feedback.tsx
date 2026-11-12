import { i18n } from '#i18n';
import { Icon, type IconName } from './Icon';

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
      <span className="flex items-center gap-1.5">
        <Icon icon="alert-triangle" className="text-sm" />
        {message}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md px-2 py-0.5 text-[11px] font-bold text-red-100 transition hover:bg-red-500/20"
        >
          {i18n.t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: IconName;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 bg-panel/50 px-4 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime/10 text-lime">
        <Icon icon={icon} className="text-lg" />
      </span>
      <p className="text-sm font-bold text-white">{title}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
