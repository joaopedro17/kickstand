import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { i18n } from '#i18n';
import {
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  Funnel,
  Image as ImageIcon,
  LayoutGrid,
  List,
  LogIn,
  LogOut,
  MonitorOff,
  Plus,
  Radio,
  Search,
  Settings,
  TriangleAlert,
  Tv,
  X,
  type LucideIcon,
} from 'lucide-react';

// Small primitives — kept in one file because the popup has only a handful of
// call sites and a dedicated components/ tree would be premature. Every class
// list is verbatim from the design system so a Tailwind JIT scan picks them up.

type Div = ComponentPropsWithoutRef<'div'>;
type Btn = ComponentPropsWithoutRef<'button'>;
type Input = ComponentPropsWithoutRef<'input'>;

/** A clickable card that lifts and highlights on hover. */
export function Card({ className = '', ...props }: Div) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-panel shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-lime/40 hover:bg-panel-hover hover:shadow-[0_10px_28px_rgba(0,0,0,.3)] ${className}`}
      {...props}
    />
  );
}

/** A <button> with `base` classes, plus any the caller adds. */
function buttonWith(base: string) {
  return function StyledButton({ className = '', children, ...props }: Btn) {
    return (
      <button {...props} className={`${base} ${className}`}>
        {children}
      </button>
    );
  };
}

export const PrimaryButton = buttonWith(
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-lime px-4 text-sm font-extrabold text-ink transition hover:bg-lime-soft hover:shadow-[0_0_20px_rgba(184,243,74,.2)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none'
);

export const GhostButton = buttonWith(
  'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-ink px-3 text-xs font-bold text-muted transition hover:border-lime/50 hover:bg-lime hover:text-ink active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-ink disabled:hover:text-muted'
);

export const IconButton = buttonWith('text-muted transition hover:text-lime disabled:opacity-60');

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

/** `headingId` is what the surrounding section's aria-labelledby points at. */
export function SectionHeader({
  icon,
  title,
  headingId,
  kicker,
  right,
}: {
  icon: IconName;
  title: string;
  headingId: string;
  kicker?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime/10 text-lime">
        <Icon icon={icon} className="text-base" />
      </span>
      <div className="flex-1">
        <h2 id={headingId} className="text-sm font-extrabold tracking-tight">
          {title}
        </h2>
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

/**
 * Every icon the popup uses, bundled with the extension. The previous
 * web-component icons downloaded their SVG data from a third-party API at
 * runtime, so they were blank offline and made an undisclosed request.
 */
const ICONS = {
  'alert-triangle': TriangleAlert,
  bell: Bell,
  'bell-off': BellOff,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'external-link': ExternalLink,
  eye: Eye,
  filter: Funnel,
  image: ImageIcon,
  'layout-grid': LayoutGrid,
  list: List,
  'log-in': LogIn,
  'log-out': LogOut,
  plus: Plus,
  radio: Radio,
  search: Search,
  settings: Settings,
  tv: Tv,
  'tv-off': MonitorOff,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ icon, className = '' }: { icon: IconName; className?: string }) {
  const Svg = ICONS[icon];
  // 1em square, sitting on the text baseline: callers size icons with
  // Tailwind's text-* classes, as they would a glyph.
  return (
    <Svg
      size="1em"
      aria-hidden="true"
      className={`inline-block shrink-0 align-[-0.125em] ${className}`}
    />
  );
}

// Each unit starts where the smaller one would round up into it, so 999,999
// is "1.0M", not "1000K", and 9,960 is "10K", not "10.0K".
export function formatCount(n: number): string {
  if (n >= 999_500) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 9_950) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
