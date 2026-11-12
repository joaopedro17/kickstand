import type { ReactNode } from 'react';
import type { IconName } from '../shared/Icon';
import { SectionHeader } from '../shared/layout';

/** A card in the Settings panel, named by its heading for screen readers. */
export function SettingsSection({
  id,
  icon,
  title,
  kicker,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      className="mb-5 rounded-2xl border border-white/[0.06] bg-panel p-4 shadow-lg shadow-black/10"
      aria-labelledby={headingId}
    >
      <SectionHeader icon={icon} title={title} headingId={headingId} kicker={kicker} />
      {children}
    </section>
  );
}
