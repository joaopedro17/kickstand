import { useEffect, useState } from 'react';

/** How often time-relative labels ("Updated 3 min ago", "Live for 2h 5m") are recomputed. */
const CLOCK_TICK_MS = 30_000;

/** The current time, refreshed every CLOCK_TICK_MS while the component is shown. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
