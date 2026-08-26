import { useState } from 'react';
import { i18n } from '#i18n';
import { translateErrorCode } from '@/lib/error-messages';

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
      setError(translateErrorCode(result?.error ?? 'unknown'));
      setLoading(false);
    }
  }

  return (
    <div style={{ width: 320, padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>{i18n.t('login.title')}</h1>
      <p>{i18n.t('login.subtitle')}</p>
      <button onClick={handleLogin} disabled={loading}>
        {loading ? i18n.t('login.buttonLoading') : i18n.t('login.button')}
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  );
}
