import { useEffect, useState } from 'react';
import { withAuthRetry } from '@/lib/auth';
import { fetchLivestreams, KickApiError } from '@/lib/kick-api';
import type { KickLivestream } from '@/lib/types';

// Kick's API returns livestreams oldest-first with no sort option, so a
// small page would mostly surface long-running low-viewer streams. Fetching
// a much bigger batch per page makes the client-side viewer-count sort
// actually representative of what's live right now.
const FETCH_LIMIT = 100;

export function BrowseTab({ categoryId }: { categoryId?: number } = {}) {
  const [streams, setStreams] = useState<KickLivestream[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await withAuthRetry((accessToken) =>
        fetchLivestreams(
          {
            cursor: reset ? undefined : cursor ?? undefined,
            limit: FETCH_LIMIT,
            categoryId: categoryId ? [categoryId] : undefined,
          },
          accessToken
        )
      );
      if (!res) throw new Error('Not logged in');
      setStreams((prev) => {
        const merged = reset ? res.data : [...prev, ...res.data];
        return [...merged].sort((a, b) => b.viewer_count - a.viewer_count);
      });
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
  }, [categoryId]);

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

      {loading && streams.length === 0 && (
        <div style={{ color: '#666', fontSize: 12, padding: '8px 0' }}>
          Loading…
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
