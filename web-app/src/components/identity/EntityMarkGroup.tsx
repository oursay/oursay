import type {
  AuthorGeoRelation,
  PillDisplayMode,
  PlatformRole,
  SignTier,
  VerificationTier,
} from "@/lib/types";
import { showsSignedPill, signIconVariant } from "@/lib/types/sign-tier";
import { EntityMark, type EntityMarkSpec } from "./EntityMark";

export type BadgeSurface = "post" | "comment";

/** Depth-aware pill modes per DESIGN-DECISIONS §2 / product table. */
export function authorBadgeModes(
  surface: BadgeSurface,
  depth = 1,
): { signedMode: PillDisplayMode; kycMode: PillDisplayMode } {
  if (surface === "post") {
    return { signedMode: "icon", kycMode: "full" };
  }
  if (depth === 1) {
    return { signedMode: "full", kycMode: "icon" };
  }
  return { signedMode: "icon", kycMode: "icon" };
}

export type ResolveEntityMarksInput = {
  signTier?: SignTier;
  /**
   * Official role flag (not a KYC tier). May later widen to seat-/jurisdiction-
   * scoped lists without changing mark type.
   */
  official?: boolean;
  /**
   * Media mark reserved — not emitted until wire exists.
   * TODO(media-mark): emit `{ type: "media", subtype: "journalist" }` when true.
   */
  media?: boolean;
  platformRole?: PlatformRole | null;
  /** KYC tier 0–2 only. */
  tier: VerificationTier;
  authorGeo?: AuthorGeoRelation;
};

export type MarkWithMode = {
  spec: EntityMarkSpec;
  mode: PillDisplayMode;
};

function signingSubtype(
  variant: NonNullable<ReturnType<typeof signIconVariant>>,
): "passkey" | "fingerprint" | "face" {
  if (variant === "key") return "passkey";
  return variant;
}

function residencyContext(
  geo: AuthorGeoRelation | undefined,
): "jurisdiction" | "affected" | "myDistrict" | undefined {
  if (geo === "home") return "myDistrict";
  if (geo === "affected") return "affected";
  if (geo === "jurisdiction") return "jurisdiction";
  return undefined;
}

/**
 * Selection + order only (most → least important, left → right):
 * Signed → Official → Media → Platform → KYC.
 *
 * TODO(mark-collapse): when visible marks > 3, force all to icon mode; then
 * hide from right to left (KYC → Platform → Media → Official → Signed) as
 * space tightens. Order above is priority for keep.
 */
export function resolveEntityMarks(input: ResolveEntityMarksInput): EntityMarkSpec[] {
  const marks: EntityMarkSpec[] = [];

  if (showsSignedPill(input.signTier)) {
    const variant = signIconVariant(input.signTier);
    if (variant) {
      marks.push({ type: "signing", subtype: signingSubtype(variant) });
    }
  }

  if (input.official) {
    marks.push({ type: "official", subtype: "official" });
  }

  // Media reserved — do not emit until wire exists (input.media ignored).

  if (input.platformRole === "admin") {
    marks.push({ type: "platform", subtype: "admin" });
  }

  if (input.tier === 1) {
    marks.push({ type: "kyc", subtype: "identity" });
  } else if (input.tier === 2) {
    const context = residencyContext(input.authorGeo);
    marks.push(
      context
        ? { type: "kyc", subtype: "residency", context }
        : { type: "kyc", subtype: "residency" },
    );
  }

  return marks;
}

/** Apply surface/depth modes: signing uses signedMode; all others use kycMode. */
export function applyMarkModes(
  marks: EntityMarkSpec[],
  modes: { signedMode: PillDisplayMode; kycMode: PillDisplayMode },
): MarkWithMode[] {
  return marks.map((spec) => ({
    spec,
    mode: spec.type === "signing" ? modes.signedMode : modes.kycMode,
  }));
}

export type EntityMarkGroupProps = ResolveEntityMarksInput & {
  signedMode: PillDisplayMode;
  kycMode: PillDisplayMode;
  align?: "left" | "right";
  /** Pre-resolved marks (skips resolveEntityMarks when provided). */
  marks?: MarkWithMode[];
};

/**
 * Policy + render for author entity marks. Preferred API over AuthorBadgeGroup.
 */
export function EntityMarkGroup({
  signTier,
  official,
  media,
  platformRole,
  tier,
  authorGeo,
  signedMode,
  kycMode,
  align = "left",
  marks: preResolved,
}: EntityMarkGroupProps) {
  const resolved =
    preResolved ??
    applyMarkModes(
      resolveEntityMarks({
        signTier,
        official,
        media,
        platformRole,
        tier,
        authorGeo,
      }),
      { signedMode, kycMode },
    );

  if (resolved.length === 0) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 ${align === "right" ? "ml-auto" : ""}`}
    >
      {resolved.map(({ spec, mode }, i) => (
        <EntityMark key={`${spec.type}-${spec.subtype}-${i}`} {...spec} mode={mode} />
      ))}
    </span>
  );
}
