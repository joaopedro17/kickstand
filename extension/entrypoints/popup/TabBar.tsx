export type TabName = 'following' | 'browse' | 'categories';

const TABS: { name: TabName; label: string }[] = [
  { name: 'following', label: 'Following' },
  { name: 'browse', label: 'Browse' },
  { name: 'categories', label: 'Categories' },
];

export function TabBar({
  active,
  onChange,
}: {
  active: TabName;
  onChange: (tab: TabName) => void;
}) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #ddd' }}>
      {TABS.map((tab) => (
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
