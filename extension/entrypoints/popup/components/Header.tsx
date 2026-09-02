import { i18n } from '#i18n';

export type TabName = 'following' | 'browse' | 'categories';

export function Header({
  activeTab,
  onChange,
  onProfileClick,
  avatarUrl,
  settingsOpen,
}: {
  activeTab: TabName;
  onChange: (tab: TabName) => void;
  onProfileClick: () => void;
  avatarUrl: string | null;
  settingsOpen: boolean;
}) {
  const tabs: { name: TabName; label: string }[] = [
    { name: 'following', label: i18n.t('tabs.following') },
    { name: 'browse', label: i18n.t('tabs.browse') },
    { name: 'categories', label: i18n.t('tabs.categories') },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-ink px-3 pt-3 pb-2">
      <div className="flex items-center justify-between gap-2">
        <nav
          className="grid flex-1 grid-cols-3 items-center gap-1"
          aria-label="Primary navigation"
        >
          {tabs.map((tab) => {
            const active = !settingsOpen && tab.name === activeTab;
            return (
              <button
                key={tab.name}
                type="button"
                onClick={() => onChange(tab.name)}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'group relative flex min-h-11 items-center justify-center rounded-xl bg-white/[0.06] text-sm font-bold text-white shadow-[inset_0_0_0_1px_rgba(184,243,74,.35)] transition hover:bg-white/[0.1]'
                    : 'flex min-h-11 items-center justify-center rounded-xl text-sm font-medium text-muted transition hover:bg-white/[0.07] hover:text-white'
                }
              >
                {tab.label}
                {active && (
                  <span className="absolute -bottom-[1px] left-3 right-3 h-0.5 rounded-full bg-lime" />
                )}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={onProfileClick}
          aria-label={i18n.t('app.settingsTitle')}
          aria-pressed={settingsOpen}
          className={
            'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-neutral-700 shadow-[0_0_0_3px_rgba(184,243,74,.08)] transition hover:scale-105 ' +
            (settingsOpen ? 'border-lime' : 'border-lime/70')
          }
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-base">⚙️</span>
          )}
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-ink bg-lime" />
        </button>
      </div>
    </header>
  );
}
