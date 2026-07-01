import type { VerificationTier } from "./verification";

/**
 * The signed-in (or logged-out) viewer's context. Replaces the wireframe's
 * global `state.loggedIn` / `state.kyc` / MY_DISTRICTS so the read-model helpers
 * can stay pure. Reads are open to everyone; only writes need an account.
 */
export interface ViewerContext {
  loggedIn: boolean;
  /** Viewer's KYC tier: 0 unverified · 1 identity · 2 residency. */
  kycTier: VerificationTier;
  /** The viewer's home riding slug(s), used by the My Districts geography filter. */
  viewerDistricts: string[];
}

/** A logged-out default viewer (reads are open). */
export const ANON_VIEWER: ViewerContext = {
  loggedIn: false,
  kycTier: 0,
  viewerDistricts: [],
};
