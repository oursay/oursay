/**
 * Thin donation seam — GitHub Sponsors only (no payment gateway).
 */

import { GITHUB_SPONSORS_URL } from "./flags";

export type DonationSuggestedAmount = 1 | 5 | 10 | 20;

export const DONATION_SUGGESTED_AMOUNTS: readonly DonationSuggestedAmount[] = [
  1, 5, 10, 20,
];

export function getSponsorsUrl(): string | null {
  return GITHUB_SPONSORS_URL || null;
}

/** Open GitHub Sponsors in a new tab. Returns false if URL is not configured. */
export function openGitHubSponsors(): boolean {
  const url = getSponsorsUrl();
  if (!url) {
    if (typeof console !== "undefined") {
      console.warn(
        "[web-app] NEXT_PUBLIC_GITHUB_SPONSORS_URL is unset — cannot open Sponsors.",
      );
    }
    return false;
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return true;
}
