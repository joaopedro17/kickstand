import { useEffect, useState } from 'react';
import { getHidden, watchHidden, type HiddenFromBrowse } from '@/lib/browse-hidden';

const NOTHING_HIDDEN: HiddenFromBrowse = { channels: [], categories: [] };

/** What is hidden from Browse, kept current as it changes. */
export function useHidden(): HiddenFromBrowse {
  const [hidden, setHidden] = useState(NOTHING_HIDDEN);
  useEffect(() => {
    getHidden().then(setHidden);
    return watchHidden(setHidden);
  }, []);
  return hidden;
}
