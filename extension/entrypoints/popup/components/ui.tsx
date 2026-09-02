import type { ComponentPropsWithoutRef, ReactNode } from 'react';

// Small primitives — kept in one file because the popup has only a handful of
// call sites and a dedicated components/ tree would be premature. Every class
// list is verbatim from the design system so a Tailwind JIT scan picks them up.

type Div = ComponentPropsWithoutRef<'div'>;
type Btn = ComponentPropsWithoutRef<'button'>;
type Input = ComponentPropsWithoutRef<'input'>;
type Select = ComponentPropsWithoutRef<'select'>;

export function Card({
  className = '',
  interactive = false,
  ...props
}: Div & { interactive?: boolean }) {
  const base =
    'rounded-2xl border border-white/[0.06] bg-panel shadow-lg shadow-black/10';
  const hover = interactive
    ? ' transition duration-200 hover:-translate-y-0.5 hover:border-lime/40 hover:bg-panel-hover hover:shadow-[0_10px_28px_rgba(0,0,0,.3)]'
    : '';
  return <div className={`${base}${hover} ${className}`} {...props} />;
}

export function PrimaryButton({ className = '', children, ...props }: Btn) {
  return (
    <button
      {...props}
      className={
        'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-lime px-4 text-sm font-extrabold text-ink transition hover:bg-lime-soft hover:shadow-[0_0_20px_rgba(184,243,74,.2)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none ' +
        className
      }
    >
      {children}
    </button>
  );
}

export function GhostButton({ className = '', children, ...props }: Btn) {
  return (
    <button
      {...props}
      className={
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-ink px-3 text-xs font-bold text-muted transition hover:border-lime/50 hover:bg-lime hover:text-ink active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-ink disabled:hover:text-muted ' +
        className
      }
    >
      {children}
    </button>
  );
}

export function IconButton({
  className = '',
  children,
  ...props
}: Btn) {
  return (
    <button
      {...props}
      className={
        'text-muted transition hover:text-lime disabled:opacity-60 ' + className
      }
    >
      {children}
    </button>
  );
}

export function TextInput({ className = '', ...props }: Input) {
  return (
    <input
      {...props}
      className={
        'min-w-0 flex-1 rounded-xl border border-white/10 bg-ink px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-muted/70 hover:border-white/20 focus:border-lime focus:ring-2 focus:ring-lime/20 ' +
        className
      }
    />
  );
}

export function Select({ className = '', children, ...props }: Select) {
  return (
    <div className="relative">
      <select
        {...props}
        className={
          'w-full appearance-none rounded-xl border border-white/10 bg-ink px-3 py-2.5 pr-10 text-sm text-white outline-none transition hover:border-white/20 focus:border-lime focus:ring-2 focus:ring-lime/20 ' +
          className
        }
      >
        {children}
      </select>
      <Icon
        icon="lucide:chevron-down"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

export function SectionHeader({
  icon,
  title,
  kicker,
  right,
}: {
  icon: string;
  title: string;
  kicker?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime/10 text-lime">
        <Icon icon={icon} className="text-base" />
      </span>
      <div className="flex-1">
        <h2 className="text-sm font-extrabold tracking-tight">{title}</h2>
        {kicker && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            {kicker}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

export function LiveBadge({ animated = false }: { animated?: boolean }) {
  return (
    <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
      {animated && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      )}
      Live
    </span>
  );
}

export function ViewerCount({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-1 text-lime">
      <Icon icon="lucide:eye" />
      {formatCount(count)}
    </span>
  );
}

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
        <Icon icon="lucide:alert-triangle" className="text-sm" />
        {message}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md px-2 py-0.5 text-[11px] font-bold text-red-100 transition hover:bg-red-500/20"
        >
          Retry
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
  icon: string;
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

export function Icon({
  icon,
  className = '',
}: {
  icon: string;
  className?: string;
}) {
  // iconify-icon is a custom element; wrap it so consumers stay in TSX-land
  // without every file re-declaring the JSX intrinsic.
  return (
    // @ts-expect-error — iconify-icon ships its own JSX augmentation but
    // TypeScript picks it up only after the first successful build.
    <iconify-icon icon={icon} class={className} />
  );
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString();
}
