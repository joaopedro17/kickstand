import { useEffect, useState } from 'react';
import { authTokensStorage } from '@/lib/storage';
import { withAuthRetry } from '@/lib/auth';
import { fetchCurrentUser } from '@/lib/kick-api';
import { LoginScreen } from './LoginScreen';
import { Header, type TabName } from './components/Header';
import { FollowingTab } from './FollowingTab';
import { BrowseTab } from './BrowseTab';
import { CategoriesTab } from './CategoriesTab';
import { SettingsPanel } from './SettingsPanel';

const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 560;

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>('following');
  const [browseCategory, setBrowseCategory] = useState<
    { id: number; name: string } | null
  >(null);
  const [showSettings, setShowSettings] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    authTokensStorage.getValue().then((tokens) => setLoggedIn(tokens !== null));
    return authTokensStorage.watch((tokens) => setLoggedIn(tokens !== null));
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    withAuthRetry((accessToken) => fetchCurrentUser(accessToken)).then(
      (user) => user && setAvatarUrl(user.profile_picture)
    );
  }, [loggedIn]);

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
