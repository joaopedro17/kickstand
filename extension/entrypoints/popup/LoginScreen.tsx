import { useState } from 'react';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    // Runs in the background service worker, not here — launchWebAuthFlow's
    // OAuth window steals focus and closes this popup mid-flow otherwise.
    // If that happens, this response never arrives, but authTokensStorage's
    // watcher in App.tsx picks up the result next time the popup opens.
    const result = await browser.runtime.sendMessage({ type: 'login' }).catch(
      () => null
    );
    if (result?.success) {
      onLoggedIn();
    } else {
      setError(result?.error ?? 'Login failed');
      setLoading(false);
    }
  }

  return (
    <div style={{ width: 320, padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>Kickstand</h1>
      <p>Track Kick channels and see who's live.</p>
      <button onClick={handleLogin} disabled={loading}>
        {loading ? 'Logging in…' : 'Log in with Kick'}
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  );
}
