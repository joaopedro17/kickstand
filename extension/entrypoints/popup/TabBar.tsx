import { i18n } from '#i18n';

export type TabName = 'following' | 'browse' | 'categories';

export function TabBar({
  active,
  onChange,
}: {
  active: TabName;
  onChange: (tab: TabName) => void;
}) {
  const tabs: { name: TabName; label: string }[] = [
    { name: 'following', label: i18n.t('tabs.following') },
    { name: 'browse', label: i18n.t('tabs.browse') },
    { name: 'categories', label: i18n.t('tabs.categories') },
  ];

  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #ddd' }}>
      {tabs.map((tab) => (
        <button
          key={tab.name}
          onClick={() => onChange(tab.name)}
          style={{
            flex: 1,
            padding: 8,
            background: 'none',
            border: 'none',
            borderBottom: tab.name === active ? '2px solid #53FC18' : '2px solid transparent',
            fontWeight: tab.name === active ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
