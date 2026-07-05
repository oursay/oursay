/**
 * Relative timestamp label, matching the wireframe's relTime() cutoffs exactly:
 *   < 1m        -> "just now"
 *   < 60m       -> "Nm ago"
 *   < 24h       -> "Nh ago"
 *   <= 6 days   -> "Nd ago"
 *   > 6 days    -> absolute "YYYY-MM-DD"
 *
 * Pure: pass the reference `now` (mock NOW in tests) rather than reading a clock.
 */
export function relTime(iso: string, now: Date): string {
  const t = new Date(iso);
  const mins = Math.floor((now.getTime() - t.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days <= 6) return `${days}d ago`;
  return iso.slice(0, 10);
}
