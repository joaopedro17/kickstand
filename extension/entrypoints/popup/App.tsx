import { useEffect, useState } from 'react';
import { authTokensStorage } from '@/lib/storage';
import { LoginScreen } from './login/LoginScreen';
import { Header, type TabName } from './shared/Header';
import { FollowingTab } from './following/FollowingTab';
import { BrowseTab } from './browse/BrowseTab';
import { CategoriesTab } from './categories/CategoriesTab';
import { SettingsPanel } from './settings/SettingsPanel';
import { useAvatar } from './shared/useAvatar';

const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 560;

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>('following');
  const [browseCategory, setBrowseCategory] = useState<
    { id: number; name: string } | null
  >(null);
  const [showSettings, setShowSettings] = useState(false);
  const avatarUrl = useAvatar(loggedIn === true);

  useEffect(() => {
    authTokensStorage.getValue().then((tokens) => setLoggedIn(tokens !== null));
    return authTokensStorage.watch((tokens) => setLoggedIn(tokens !== null));
  }, []);

  if (loggedIn === null) return null;
  if (!loggedIn) return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />;

  return (
    <div
      className="flex flex-col overflow-hidden bg-ink text-white"
      style={{ width: POPUP_WIDTH, height: POPUP_HEIGHT }}
    >
      <Header
        activeTab={activeTab}
        onChange={(tab) => {
          setActiveTab(tab);
          setShowSettings(false);
          if (tab !== 'browse') setBrowseCategory(null);
        }}
        onProfileClick={() => setShowSettings((v) => !v)}
        avatarUrl={avatarUrl}
        settingsOpen={showSettings}
      />

      <main className="flex-1 overflow-y-auto px-3 py-4">
        {showSettings ? (
          <SettingsPanel />
        ) : activeTab === 'following' ? (
          <FollowingTab />
        ) : activeTab === 'browse' ? (
          <BrowseTab
            categoryId={browseCategory?.id}
            categoryName={browseCategory?.name}
            onClearCategory={() => setBrowseCategory(null)}
          />
        ) : (
          <CategoriesTab
            onSelectCategory={(id, name) => {
              setBrowseCategory({ id, name });
              setActiveTab('browse');
            }}
          />
        )}
      </main>
    </div>
  );
}
