import type { ComponentPropsWithoutRef } from 'react';

// Class lists are written out in full, never assembled from fragments, so
// Tailwind's scan of the source finds every class.

type Btn = ComponentPropsWithoutRef<'button'>;
type Input = ComponentPropsWithoutRef<'input'>;

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
