"use client";

import Link from "next/link";
import { SHOW_DEMO_BANNER } from "@/lib/donations";

/**
 * Non-affiliation / demo notice. Shown by default; hide with
 * `NEXT_PUBLIC_SHOW_DEMO_BANNER=false` (or `0`).
 *
 * When both demo and donation banners are enabled, demo wins (see
 * `resolveFabBanner` — console.warn once).
 *
 * Sits behind the compose FAB: the strip extends at most halfway under the
 * button (`right-5` + half of `size-14` = `right-12`), while `pr-7` keeps
 * copy wrapping before the covered zone.
 */
export { SHOW_DEMO_BANNER };

export function DemoBanner() {
  if (!SHOW_DEMO_BANNER) return null;

  return (
    <div className="pointer-events-none absolute bottom-5 left-0 right-12 z-30">
      <Link
        href="/help/signing"
        className="pointer-events-auto block bg-surface/60 py-1.5 pl-3 pr-7 text-center text-[11px] leading-snug text-muted backdrop-blur-sm"
      >
        Demonstration preview — OurSay is independent and not affiliated with any
        government.{" "}
        <span className="underline underline-offset-2">Learn more</span>
      </Link>
    </div>
  );
}
