import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

// Class lists are written out in full, never assembled from fragments, so
// Tailwind's scan of the source finds every class.

type Div = ComponentPropsWithoutRef<'div'>;

/** A clickable card that lifts and highlights on hover. */
export function Card({ className = '', ...props }: Div) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-panel shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-lime/40 hover:bg-panel-hover hover:shadow-[0_10px_28px_rgba(0,0,0,.3)] ${className}`}
      {...props}
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
