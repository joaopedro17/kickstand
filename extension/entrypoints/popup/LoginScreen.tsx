import { useState } from 'react';
import { startLoginFlow } from '@/lib/auth';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      await startLoginFlow();
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
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
