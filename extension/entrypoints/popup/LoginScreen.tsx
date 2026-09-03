import { useState } from 'react';
import { i18n } from '#i18n';
import { translateErrorCode } from '@/lib/error-messages';
import { Icon, PrimaryButton } from './components/ui';

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
    const result = await browser.runtime
      .sendMessage({ type: 'login' })
      .catch(() => null);
    if (result?.success) {
      onLoggedIn();
    } else {
      setError(translateErrorCode(result?.error ?? 'unknown'));
      setLoading(false);
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-4 bg-ink px-6 py-10 text-center text-white"
      style={{ width: 380, minHeight: 480 }}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lime/10 text-lime shadow-[0_0_0_4px_rgba(184,243,74,.08)]">
        <Icon icon="lucide:tv" className="text-2xl" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-extrabold tracking-tight">
          {i18n.t('login.title')}
        </h1>
        <p className="text-sm text-muted">{i18n.t('login.subtitle')}</p>
      </div>
      <PrimaryButton
        onClick={handleLogin}
        disabled={loading}
        className="mt-2 min-w-[180px]"
      >
        <Icon icon="lucide:log-in" />
        {loading ? i18n.t('login.buttonLoading') : i18n.t('login.button')}
      </PrimaryButton>
      {error && (
        <p className="mt-1 max-w-[280px] text-xs text-red-300">{error}</p>
      )}
    </div>
  );
}
