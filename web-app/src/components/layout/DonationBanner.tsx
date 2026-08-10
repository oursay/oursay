"use client";

import { Heart } from "lucide-react";
import {
  donationProviderConfigured,
  donationsUnavailableMessage,
  SHOW_DONATION_BANNER,
} from "@/lib/donations";

interface DonationBannerProps {
  /** Opens the public donation modal (or toast if donations are unconfigured). */
  onOpenDonate: () => void;
}

/**
 * Campaign strip above the compose FAB. Only rendered when the donation banner
 * flag is on **and** the demo banner is not winning (see `resolveFabBanner`).
 *
 * Layout mirrors `DemoBanner` so the FAB overlap math stays the same.
 */
export function DonationBanner({ onOpenDonate }: DonationBannerProps) {
  if (!SHOW_DONATION_BANNER) return null;

  const canDonate = donationProviderConfigured();

  return (
    <div className="pointer-events-none absolute bottom-5 left-0 right-12 z-30">
      <button
        type="button"
        onClick={onOpenDonate}
        className="pointer-events-auto flex w-full items-center justify-center gap-1.5 bg-surface/60 py-1.5 pl-3 pr-7 text-center text-[11px] leading-snug text-muted backdrop-blur-sm hover:text-ink"
      >
        <Heart size={12} className="shrink-0 text-brand-600" aria-hidden />
        <span>
          {canDonate ? (
            <>
              Verification is free — help fund the next check.{" "}
              <span className="underline underline-offset-2">Donate</span>
            </>
          ) : (
            donationsUnavailableMessage()
          )}
        </span>
      </button>
    </div>
  );
}
