import { useEffect, useState } from 'react';
import { getValidAccessToken } from '@/lib/auth';
import { fetchLivestreams, KickApiError } from '@/lib/kick-api';
import type { KickLivestream } from '@/lib/types';

export function BrowseTab() {
  const [streams, setStreams] = useState<KickLivestream[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) throw new Error('Not logged in');
      const res = await fetchLivestreams(
        { cursor: reset ? undefined : cursor ?? undefined, limit: 20 },
        accessToken
      );
      setStreams((prev) => (reset ? res.data : [...prev, ...res.data]));
      setCursor(res.pagination.next_cursor);
    } catch (err) {
      setError(
        err instanceof KickApiError ? `Kick API error: ${err.message}` : 'Failed to load streams'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openStream(slug: string) {
    browser.tabs.create({ url: `https://kick.com/${slug}` });
  }

  return (
    <div>
      {error && (
        <div style={{ color: 'crimson', fontSize: 12, marginBottom: 8 }}>
          {error} <button onClick={() => load(true)}>Retry</button>
        </div>
      )}

      {streams.map((stream) => (
        <div
          key={stream.id}
          style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #eee', cursor: 'pointer' }}
          onClick={() => openStream(stream.channel.slug)}
        >
          <img src={stream.thumbnail} alt="" width={80} height={45} style={{ objectFit: 'cover' }} />
          <div>
            <div style={{ fontWeight: 'bold' }}>{stream.broadcaster_user.username}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{stream.title}</div>
            <div style={{ fontSize: 12, color: '#666' }}>
              {stream.viewer_count.toLocaleString()} viewers · {stream.category?.name ?? ''}
            </div>
          </div>
        </div>
      ))}

      {cursor && (
        <button onClick={() => load(false)} disabled={loading} style={{ width: '100%', marginTop: 8 }}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
