// Each unit starts where the smaller one would round up into it, so 999,999
// is "1.0M", not "1000K", and 9,960 is "10K", not "10.0K".
export function formatCount(n: number): string {
  if (n >= 999_500) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 9_950) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
