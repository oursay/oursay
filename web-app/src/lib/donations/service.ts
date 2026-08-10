/**
 * Thin donation seam — GitHub Sponsors or Interac e-Transfer (no payment gateway).
 *
 * Provider is selected via NEXT_PUBLIC_DONATION_MODAL_PROVIDER.
 * Sponsors checkout deep-links use `/sponsorships?frequency=&amount=` when custom
 * amounts are enabled on the Sponsors profile (GitHub honours these query params).
 */

import {
  DONATION_MODAL_PROVIDER,
  ETRANSFER_EMAIL,
  GITHUB_SPONSORS_URL,
  type DonationModalProvider,
} from "./flags";

export type DonationSuggestedAmount = 1 | 5 | 20 | 50;
export type DonationAmountChoice = DonationSuggestedAmount | "custom";
export type DonationFrequency = "one-time" | "recurring";

export const DONATION_SUGGESTED_AMOUNTS: readonly DonationSuggestedAmount[] = [
  1, 5, 20, 50,
];

export function getDonationModalProvider(): DonationModalProvider | null {
  return DONATION_MODAL_PROVIDER;
}

export function getSponsorsUrl(): string | null {
  return GITHUB_SPONSORS_URL || null;
}

export function getEtransferEmail(): string | null {
  return ETRANSFER_EMAIL || null;
}

/** Profile URL → `/sponsorships` checkout base (strips trailing slash / query). */
export function sponsorsCheckoutBase(profileUrl: string): string {
  const trimmed = profileUrl.trim().replace(/\/+$/, "");
  try {
    const u = new URL(trimmed);
    // Already a checkout path
    if (/\/sponsorships\/?$/i.test(u.pathname)) {
      u.search = "";
      u.hash = "";
      return u.toString().replace(/\/+$/, "");
    }
    // Profile: /sponsors/{account} → /sponsors/{account}/sponsorships
    u.pathname = u.pathname.replace(/\/?$/, "") + "/sponsorships";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    const base = trimmed.replace(/\/sponsorships\/?$/i, "");
    return `${base}/sponsorships`;
  }
}

export interface SponsorsSelection {
  amount: DonationAmountChoice;
  recurring: boolean;
}

/**
 * Build checkout URL from modal selection.
 * Prefixed amounts use `/sponsorships?frequency=&amount=`.
 * `custom` opens the Sponsors **profile** page (checkout without `amount` 404s on GitHub).
 */
export function sponsorsUrlForSelection(selection: SponsorsSelection): string | null {
  const profile = getSponsorsUrl();
  if (!profile) return null;

  // Custom: land on the public Sponsors page so the user picks amount/frequency there.
  if (selection.amount === "custom") {
    try {
      const u = new URL(profile.trim());
      u.hash = "";
      // If env already points at /sponsorships, strip back to the profile path.
      u.pathname = u.pathname.replace(/\/sponsorships\/?$/i, "") || u.pathname;
      u.search = "";
      return u.toString().replace(/\/+$/, "");
    } catch {
      return profile.trim().replace(/\/sponsorships\/?$/i, "").replace(/\/+$/, "");
    }
  }

  const checkout = new URL(sponsorsCheckoutBase(profile));
  checkout.searchParams.set("frequency", selection.recurring ? "monthly" : "one-time");
  checkout.searchParams.set("amount", String(selection.amount));
  return checkout.toString();
}

/** @deprecated Prefer sponsorsUrlForSelection — kept for callers that pass a bare amount. */
export function sponsorsUrlForAmount(
  amount: number,
  frequency: DonationFrequency = "one-time",
): string | null {
  return sponsorsUrlForSelection({
    amount: amount as DonationSuggestedAmount,
    recurring: frequency === "recurring",
  });
}

/** Open GitHub Sponsors for a modal selection (or bare profile if no selection). */
export function openGitHubSponsors(selection?: SponsorsSelection): boolean {
  const url = selection ? sponsorsUrlForSelection(selection) : getSponsorsUrl();
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
