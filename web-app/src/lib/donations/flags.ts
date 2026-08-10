/**
 * Donation / demo surface flags (NEXT_PUBLIC_*).
 *
 * Demo banner supersedes the donation banner when both are enabled.
 */

function truthy(flag: string | undefined): boolean {
  return flag === "1" || flag === "true";
}

function falsy(flag: string | undefined): boolean {
  return flag === "0" || flag === "false";
}

/** Default-on: show unless explicitly disabled. */
export function envDefaultOn(flag: string | undefined): boolean {
  return !falsy(flag);
}

/** Default-off: show only when explicitly enabled. */
export function envDefaultOff(flag: string | undefined): boolean {
  return truthy(flag);
}

/** Non-affiliation / demo strip above the FAB. Default: on. */
export const SHOW_DEMO_BANNER = envDefaultOn(process.env.NEXT_PUBLIC_SHOW_DEMO_BANNER);

/** Donation campaign strip above the FAB. Default: off. Superseded by demo when both on. */
export const SHOW_DONATION_BANNER = envDefaultOff(process.env.NEXT_PUBLIC_SHOW_DONATION_BANNER);

/** Public-visitor donation modal (banner / auth / explicit open). Default: off. */
export const SHOW_DONATION_MODAL_PUBLIC = envDefaultOff(
  process.env.NEXT_PUBLIC_SHOW_DONATION_MODAL_PUBLIC,
);

/**
 * Soft-ask before KYC session start (Get verified / recovery biometric). Default: off.
 * Skip still continues to free verification.
 */
export const SHOW_DONATION_MODAL_KYC = envDefaultOff(
  process.env.NEXT_PUBLIC_SHOW_DONATION_MODAL_KYC,
);

/** GitHub Sponsors page. Empty → donate CTAs stay disabled with a console hint. */
export const GITHUB_SPONSORS_URL = (
  process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL ?? ""
).trim();

/**
 * Which checkout path the donation modal uses.
 * `github` (default) → Sponsors deep-links; `etransfer` → Interac email + copy UI.
 */
export type DonationModalProvider = "github" | "etransfer";

function parseDonationModalProvider(
  raw: string | undefined,
): DonationModalProvider {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "etransfer" || v === "e-transfer" || v === "interac") return "etransfer";
  return "github";
}

export const DONATION_MODAL_PROVIDER = parseDonationModalProvider(
  process.env.NEXT_PUBLIC_DONATION_MODAL_PROVIDER,
);

/** Interac e-Transfer recipient. Empty → etransfer modal CTAs stay disabled. */
export const ETRANSFER_EMAIL = (
  process.env.NEXT_PUBLIC_ETRANSFER_EMAIL ?? ""
).trim();

/** True when the active modal provider has its required config. */
export function donationProviderConfigured(): boolean {
  if (DONATION_MODAL_PROVIDER === "etransfer") return Boolean(ETRANSFER_EMAIL);
  return Boolean(GITHUB_SPONSORS_URL);
}

/** True when any donation UI surface is enabled. */
export function donationsSurfacesEnabled(): boolean {
  return SHOW_DONATION_BANNER || SHOW_DONATION_MODAL_PUBLIC || SHOW_DONATION_MODAL_KYC;
}

/**
 * Which FAB strip to render. Demo wins over donation; warns once when both flags are on.
 */
export function resolveFabBanner(): "demo" | "donation" | null {
  if (SHOW_DEMO_BANNER && SHOW_DONATION_BANNER) {
    warnBannerConflictOnce();
    return "demo";
  }
  if (SHOW_DEMO_BANNER) return "demo";
  if (SHOW_DONATION_BANNER) return "donation";
  return null;
}

let bannerConflictWarned = false;

function warnBannerConflictOnce(): void {
  if (bannerConflictWarned) return;
  bannerConflictWarned = true;
  if (typeof console !== "undefined") {
    console.warn(
      "[web-app] NEXT_PUBLIC_SHOW_DEMO_BANNER and NEXT_PUBLIC_SHOW_DONATION_BANNER are both enabled. " +
        "Demo banner supersedes the donation banner. Set NEXT_PUBLIC_SHOW_DEMO_BANNER=false to show donations.",
    );
  }
}

/** Test helper — resets the one-shot conflict warn. */
export function resetBannerConflictWarnForTests(): void {
  bannerConflictWarned = false;
}
