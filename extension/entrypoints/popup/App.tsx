import { useEffect, useState } from 'react';
import { authTokensStorage } from '@/lib/storage';
import { withAuthRetry } from '@/lib/auth';
import { fetchCurrentUser } from '@/lib/kick-api';
import { LoginScreen } from './LoginScreen';
import { TabBar, type TabName } from './TabBar';
import { FollowingTab } from './FollowingTab';
import { BrowseTab } from './BrowseTab';
import { CategoriesTab } from './CategoriesTab';
import { SettingsPanel } from './SettingsPanel';

const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 520;

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>('following');
  const [browseCategory, setBrowseCategory] = useState<{ id: number; name: string } | null>(null);
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
      style={{
        width: POPUP_WIDTH,
        height: POPUP_HEIGHT,
        fontFamily: 'sans-serif',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          flexShrink: 0,
          borderBottom: '1px solid #333',
        }}
      >
        <div style={{ flex: 1 }}>
          <TabBar
            active={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              if (tab !== 'browse') setBrowseCategory(null);
            }}
          />
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          title="Settings"
          style={{
            width: 28,
            height: 28,
            padding: 0,
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Settings" width={28} height={28} style={{ objectFit: 'cover' }} />
          ) : (
            '⚙️'
          )}
        </button>
      </div>

      <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
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
