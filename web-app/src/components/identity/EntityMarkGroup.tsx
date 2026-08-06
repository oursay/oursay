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

/**
 * Surface/depth mode hints (DESIGN-DECISIONS §2). Call sites still pass these
 * into EntityMarkGroup; {@link applyMarkModes} currently overrides them with
 * interim collapse.
 */
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
   * Media mark — emit journalist (and recognized shade when mediaRecognized).
   */
  media?: boolean;
  /** Jurisdiction-recognized Media accreditation for this thread/context. */
  mediaRecognized?: boolean;
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
 * Display modes / collapse live in {@link applyMarkModes}.
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

  if (input.media) {
    marks.push(
      input.mediaRecognized
        ? { type: "media", subtype: "journalist", context: "recognized" }
        : { type: "media", subtype: "journalist" },
    );
  }

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

/**
 * Role marks eligible for a single full expansion when the row is crowded.
 * Priority (most → least): official → media → platform.
 */
const ROLE_EXPAND_PRIORITY = ["official", "media", "platform"] as const;

function pickExpandedRole(
  marks: EntityMarkSpec[],
): (typeof ROLE_EXPAND_PRIORITY)[number] | null {
  for (const type of ROLE_EXPAND_PRIORITY) {
    if (marks.some((m) => m.type === type)) return type;
  }
  return null;
}

/**
 * Interim mark-collapse modes (overrides surface signedMode/kycMode):
 * - fewer than 3 marks → all `full`
 * - 3 or more → only the highest present of official → media → platform is
 *   `full`; everything else is `icon`
 *
 * TODO(mark-collapse): if more mark types land and icons still overflow,
 * start dropping icons right → left (KYC → Platform → Media → Official →
 * Signed). Display order above remains keep-priority.
 */
export function applyMarkModes(
  marks: EntityMarkSpec[],
  // Kept for call-site compatibility; interim collapse owns modes.
  _modes?: { signedMode: PillDisplayMode; kycMode: PillDisplayMode },
): MarkWithMode[] {
  void _modes;
  if (marks.length < 3) {
    return marks.map((spec) => ({ spec, mode: "full" }));
  }
  const expanded = pickExpandedRole(marks);
  return marks.map((spec) => ({
    spec,
    mode: expanded && spec.type === expanded ? "full" : "icon",
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
  mediaRecognized,
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
        mediaRecognized,
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
