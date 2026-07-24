import { useEffect, useState } from 'react';
import { authTokensStorage } from '@/lib/storage';
import { FollowingTab } from './FollowingTab';
import { LoginScreen } from './LoginScreen';
import { TabBar, type TabName } from './TabBar';

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>('following');

  useEffect(() => {
    authTokensStorage.getValue().then((tokens) => setLoggedIn(tokens !== null));
    return authTokensStorage.watch((tokens) => setLoggedIn(tokens !== null));
  }, []);

  if (loggedIn === null) return null; // brief loading flash avoided
  if (!loggedIn) return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />;

  return (
    <div style={{ width: 360, fontFamily: 'sans-serif' }}>
      <TabBar active={activeTab} onChange={setActiveTab} />
      <div style={{ padding: 12 }}>
        {activeTab === 'following' && <FollowingTab />}
        {activeTab === 'browse' && <p>Browse tab (Task 9)</p>}
        {activeTab === 'categories' && <p>Categories tab (Task 10)</p>}
      </div>
    </div>
  );
}
