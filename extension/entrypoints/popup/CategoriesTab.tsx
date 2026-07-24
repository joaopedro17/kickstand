import { useEffect, useState } from 'react';
import { getValidAccessToken } from '@/lib/auth';
import { fetchCategories, KickApiError } from '@/lib/kick-api';
import type { KickCategoryWithTags } from '@/lib/types';

export function CategoriesTab({
  onSelectCategory,
}: {
  onSelectCategory: (id: number, name: string) => void;
}) {
  const [categories, setCategories] = useState<KickCategoryWithTags[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) throw new Error('Not logged in');
      const res = await fetchCategories(
        { cursor: reset ? undefined : cursor ?? undefined, limit: 25 },
        accessToken
      );
      setCategories((prev) => (reset ? res.data : [...prev, ...res.data]));
      setCursor(res.pagination.next_cursor);
    } catch (err) {
      setError(
        err instanceof KickApiError ? `Kick API error: ${err.message}` : 'Failed to load categories'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {error && (
        <div style={{ color: 'crimson', fontSize: 12, marginBottom: 8 }}>
          {error} <button onClick={() => load(true)}>Retry</button>
        </div>
      )}

      {loading && categories.length === 0 && (
        <div style={{ color: '#666', fontSize: 12, padding: '8px 0' }}>
          Loading…
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {categories.map((category) => (
          <div
            key={category.id}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectCategory(category.id, category.name)}
          >
            <img src={category.thumbnail} alt="" width="100%" style={{ aspectRatio: '3/4', objectFit: 'cover' }} />
            <div style={{ fontSize: 12, textAlign: 'center' }}>{category.name}</div>
          </div>
        ))}
      </div>

      {cursor && (
        <button onClick={() => load(false)} disabled={loading} style={{ width: '100%', marginTop: 8 }}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
