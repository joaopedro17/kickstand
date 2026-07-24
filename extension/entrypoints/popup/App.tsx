import { useEffect, useState } from 'react';
import { authTokensStorage } from '@/lib/storage';
import { LoginScreen } from './LoginScreen';
import { TabBar, type TabName } from './TabBar';
import { FollowingTab } from './FollowingTab';
import { BrowseTab } from './BrowseTab';
import { CategoriesTab } from './CategoriesTab';
import { SettingsPanel } from './SettingsPanel';

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>('following');
  const [browseCategory, setBrowseCategory] = useState<{ id: number; name: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    authTokensStorage.getValue().then((tokens) => setLoggedIn(tokens !== null));
    return authTokensStorage.watch((tokens) => setLoggedIn(tokens !== null));
  }, []);

  if (loggedIn === null) return null;
  if (!loggedIn) return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />;

  return (
    <div style={{ width: 360, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px' }}>
        <div style={{ flex: 1 }}>
          <TabBar
            active={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              if (tab !== 'browse') setBrowseCategory(null);
            }}
          />
        </div>
        <button onClick={() => setShowSettings((v) => !v)} title="Settings">
          ⚙️
        </button>
      </div>

      <div style={{ padding: 12 }}>
        {showSettings ? (
          <SettingsPanel />
        ) : (
          <>
            {activeTab === 'following' && <FollowingTab />}
            {activeTab === 'browse' && <BrowseTab categoryId={browseCategory?.id} />}
            {activeTab === 'categories' && (
              <CategoriesTab
                onSelectCategory={(id, name) => {
                  setBrowseCategory({ id, name });
                  setActiveTab('browse');
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
