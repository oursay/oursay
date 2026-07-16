/**
 * Absolute calendar date for share cards and anywhere a fixed label is preferred
 * over a ticking relative string. Uses the ISO date prefix (UTC calendar day).
 */
export function absDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Relative timestamp label:
 *   < 2m        -> "just now"
 *   < 60m       -> "Nm ago"
 *   < 24h       -> "Nh ago"
 *   <= 6 days   -> "Nd ago"
 *   > 6 days    -> absolute "YYYY-MM-DD"
 *
 * Pure: pass the reference `now` (mock NOW in tests, `useNow()` in production)
 * rather than reading a clock inside this function.
 */
export function relTime(iso: string, now: Date): string {
  const t = new Date(iso);
  const mins = Math.max(0, Math.floor((now.getTime() - t.getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days <= 6) return `${days}d ago`;
  return absDate(iso);
}
