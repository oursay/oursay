/**
 * Action signing tier — UI projection parallel to {@link VerificationTier}.
 *
 * Every civic action is signed on-device (envelope `signScheme` is a separate
 * cryptographic layer: `p256` vs `webauthn-es256`). `signTier` describes the
 * *user-verification strength* surfaced in the Signed pill and filter:
 *
 *   0 None      — derived-key path (`p256`); no Signed pill
 *   1 Passkey   — WebAuthn passkey (Key icon); current app support
 *   2 Fingerprint — planned biometric tier
 *   3 Face      — planned face-scan tier
 *
 * Absent on a DTO ⇒ 0. Backend maps envelope + authenticator metadata → signTier.
 */

export type SignTier = 0 | 1 | 2 | 3;

/**
 * Signed Refine filter ladder (inclusive-upward, like KYC `tierMin`).
 *   0 Any       — no signTier constraint
 *   1 Passkey   — signTier >= 1
 *   2 Biometric — signTier >= 2 (fingerprint + face); dev-only in the filter UI
 */
export type SignedFilterLevel = 0 | 1 | 2;

export const SIGNED_FILTER_LEVELS = ["Any", "Passkey", "Biometric"] as const;

/** Whether the Biometric step is offered in the Signed filter cycle (hidden in prod). */
export function signedFilterIncludesBiometric(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Next Signed filter level; Biometric step omitted outside development. */
export function nextSignedFilterLevel(current: SignedFilterLevel): SignedFilterLevel {
  const max = signedFilterIncludesBiometric() ? 2 : 1;
  return (current >= max ? 0 : ((current + 1) as SignedFilterLevel));
}

/** Clamp persisted filter when Biometric is unavailable (e.g. prod build). */
export function clampSignedFilterLevel(level: SignedFilterLevel): SignedFilterLevel {
  if (level === 2 && !signedFilterIncludesBiometric()) return 0;
  return level;
}

/** Inclusive-upward signTier match for the Signed Refine ladder. */
export function passesSignedFilter(
  signTier: SignTier | undefined,
  filterLevel: SignedFilterLevel,
): boolean {
  if (filterLevel === 0) return true;
  return effectiveSignTier(signTier) >= filterLevel;
}

/** Wireframe-facing label per sign tier (Signed pill always reads "Signed"). */
export const SIGN_TIER_LABEL: Record<SignTier, string> = {
  0: "None",
  1: "Passkey",
  2: "Fingerprint",
  3: "Face",
};

export function effectiveSignTier(tier?: SignTier): SignTier {
  return tier ?? 0;
}

/** Passkey-or-stronger — surfaces the Signed pill. */
export function showsSignedPill(tier?: SignTier): boolean {
  return effectiveSignTier(tier) >= 1;
}

/** Lucide glyph for the Signed pill by sign tier. */
export type SignIconVariant = "key" | "fingerprint" | "face";

export function signIconVariant(tier?: SignTier): SignIconVariant | null {
  switch (effectiveSignTier(tier)) {
    case 1:
      return "key";
    case 2:
      return "fingerprint";
    case 3:
      return "face";
    default:
      return null;
  }
}
