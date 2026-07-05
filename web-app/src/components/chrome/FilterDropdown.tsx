"use client";

import {
  BadgeCheck,
  Eye,
  EyeOff,
  Fingerprint,
  Gavel,
  IdCard,
  Key,
  List,
  MapPin,
  PenTool,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ACTIVITY_TYPE_META,
  ALL_ACTIVITY_KINDS,
  RECORD_TYPE_ICON,
  RECORD_TYPE_LABEL,
} from "@/components/content";
import { CheckboxRow } from "@/components/ui";
import { VERIFIED_LEVELS, SIGNED_FILTER_LEVELS } from "@/lib/types";
import type {
  ActivityKind,
  GeoFilterMode,
  RecordKind,
  SignedFilterLevel,
  VerificationTier,
  ViewerContext,
} from "@/lib/types";

const ALL_KINDS: RecordKind[] = ["statement", "petition", "poll", "result"];

/** Trailing glyph for Verified ladder steps (Any has no icon). */
function verifiedLevelIcon(level: VerificationTier): LucideIcon | null {
  return [null, IdCard, MapPin, Gavel][level] ?? null;
}

/** Trailing glyph for Signed ladder steps (Any has no icon). */
function signedLevelIcon(level: SignedFilterLevel): LucideIcon | null {
  return [null, Key, Fingerprint][level] ?? null;
}

function FilterLevelBadge({
  label,
  icon: Icon,
}: {
  label: string;
  icon: LucideIcon | null;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
      {Icon ? <Icon size={14} className="shrink-0" aria-hidden /> : null}
      <span>{label}</span>
    </span>
  );
}

/** Cycle labels for the geography rows: Off shows nothing (EyeOff carries it). */
const GEO_MODE_LABEL: Record<Exclude<GeoFilterMode, "off">, string> = {
  inclusive: "Include",
  exclusive: "Only",
};

/**
 * Trailing slot for a geography row: gating notes win over the mode badge, and
 * a conflict-auto-disabled row reads "Auto off" while keeping its remembered
 * mode in state.
 */
function geoTrailing(mode: GeoFilterMode, canGeography: boolean, autoOff: boolean) {
  if (!canGeography) {
    return <span className="text-xs text-muted">Residency only</span>;
  }
  if (autoOff) {
    return <span className="text-xs text-muted">Auto off</span>;
  }
  if (mode !== "off") {
    return <FilterLevelBadge label={GEO_MODE_LABEL[mode]} icon={null} />;
  }
  return null;
}

/** Eye when the mode is actually in force; EyeOff when off or auto-disabled. */
function geoEngaged(mode: GeoFilterMode, autoOff: boolean): boolean {
  return mode !== "off" && !autoOff;
}

interface FilterDropdownProps {
  includedKinds: RecordKind[];
  onToggleKind: (kind: RecordKind) => void;
  onIsolateKind: (kind: RecordKind) => void;
  onAllKinds: () => void;
  /** Verified ladder index into VERIFIED_LEVELS (Any -> Identity -> Residency -> Official). */
  verifiedLevel: VerificationTier;
  onCycleVerified: () => void;
  /** Geography cycle: Off -> Include (broaden) -> Only (narrow) -> Off. */
  myDistricts: GeoFilterMode;
  onCycleMyDistricts: () => void;
  /** Single-jurisdiction context -> "My District" (singular); multi-jur feeds -> plural. */
  singleJurisdiction?: boolean;
  /** Signed ladder: 0 Any · 1 Passkey · 2 Biometric (Biometric dev-only in cycle). */
  signedFilter?: SignedFilterLevel;
  onCycleSignedFilter?: () => void;
  /**
   * Affected geography row shows on any open post EXCEPT one relating only to
   * the viewer's districts (there it's the same filter as My Districts).
   */
  showAffected?: boolean;
  affected?: GeoFilterMode;
  onCycleAffected?: () => void;
  /**
   * My Jurisdiction row (author-residence filter) shows on feed/list views
   * whose jurisdictions all have districts, and on open posts EXCEPT
   * jurisdiction-wide ones (there it's the same filter as Affected).
   */
  showMyJurisdiction?: boolean;
  myJurisdiction?: GeoFilterMode;
  onCycleMyJurisdiction?: () => void;
  /** Exclusive-conflict loser (see read-model resolveGeography) — shown "Auto off". */
  geoAutoDisabled?: "myDistricts" | "affected" | null;
  /** Feed/jurisdiction/district record-type section. */
  showRecordTypes?: boolean;
  /** Profile activity-type section (Statements … Reactions). */
  showActivityTypes?: boolean;
  profileTypes?: ActivityKind[];
  onToggleProfileType?: (kind: ActivityKind) => void;
  onIsolateProfileType?: (kind: ActivityKind) => void;
  onAllProfileTypes?: () => void;
  /** Signed Refine row (hidden on profile per wireframe). */
  showSigned?: boolean;
  viewer: ViewerContext;
}

/** Feed/list filter panel: record types + the Verified/geography refine section. */
export function FilterDropdown({
  includedKinds,
  onToggleKind,
  onIsolateKind,
  onAllKinds,
  verifiedLevel,
  onCycleVerified,
  myDistricts,
  onCycleMyDistricts,
  singleJurisdiction = false,
  signedFilter = 0,
  onCycleSignedFilter,
  showAffected = false,
  affected = "off",
  onCycleAffected,
  showMyJurisdiction = false,
  myJurisdiction = "off",
  onCycleMyJurisdiction,
  geoAutoDisabled = null,
  showRecordTypes = true,
  showActivityTypes = false,
  profileTypes = ALL_ACTIVITY_KINDS,
  onToggleProfileType,
  onIsolateProfileType,
  onAllProfileTypes,
  showSigned = true,
  viewer,
}: FilterDropdownProps) {
  // My Districts is only available to a residency-verified viewer (it reads the
  // viewer's own home districts). Affected is viewer-independent — it matches
  // against the open post's affected districts — so it needs no residency.
  // Engaging an exclusive still pins the (effective) Verified ladder to
  // Residency+ (only Residency+ authors have inferable districts).
  const canMyDistricts = viewer.kycTier >= 2;

  return (
    <div className="w-[250px] rounded-xl border border-border-strong bg-surface p-2 shadow-lg">
      {showRecordTypes ? (
        <>
          <p className="px-2 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-muted">
            Record types
          </p>
          <CheckboxRow
            label="All Records"
            showCheckbox={false}
            icon={<List size={16} aria-hidden />}
            onSelect={onAllKinds}
          />
          {ALL_KINDS.map((kind) => {
            const Icon = RECORD_TYPE_ICON[kind];
            const included = includedKinds.includes(kind);
            const isLast = includedKinds.length <= 1 && included;
            return (
              <CheckboxRow
                key={kind}
                label={RECORD_TYPE_LABEL[kind]}
                checked={included}
                icon={<Icon size={16} aria-hidden />}
                onToggle={() => {
                  if (isLast) return; // keep >=1 selected (never None)
                  onToggleKind(kind);
                }}
                onSelect={() => onIsolateKind(kind)}
              />
            );
          })}

          <div className="my-2 border-t border-border" />
        </>
      ) : null}
      {showActivityTypes ? (
        <>
          <p className="px-2 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-muted">
            Activity types
          </p>
          <CheckboxRow
            label="All Activity"
            showCheckbox={false}
            icon={<List size={16} aria-hidden />}
            onSelect={onAllProfileTypes}
          />
          {ALL_ACTIVITY_KINDS.map((kind) => {
            const { icon: Icon, label } = ACTIVITY_TYPE_META[kind];
            const included = profileTypes.includes(kind);
            const isLast = profileTypes.length <= 1 && included;
            const rowIcon =
              kind === "reaction" ? (
                <span
                  aria-hidden
                  className="inline-flex size-4 items-center justify-center text-sm font-bold leading-none"
                >
                  ✓
                </span>
              ) : (
                <Icon size={16} aria-hidden />
              );
            return (
              <CheckboxRow
                key={kind}
                label={label}
                checked={included}
                icon={rowIcon}
                onToggle={() => {
                  if (isLast) return;
                  onToggleProfileType?.(kind);
                }}
                onSelect={() => onIsolateProfileType?.(kind)}
              />
            );
          })}

          <div className="my-2 border-t border-border" />
        </>
      ) : null}
      <p className="px-2 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-muted">
        Refine
      </p>
      <CheckboxRow
        label="Verified"
        showCheckbox={false}
        icon={<BadgeCheck size={16} aria-hidden />}
        onSelect={onCycleVerified}
        trailing={
          <FilterLevelBadge
            label={VERIFIED_LEVELS[verifiedLevel]}
            icon={verifiedLevelIcon(verifiedLevel)}
          />
        }
      />
      {showSigned ? (
        <CheckboxRow
          label="Signed"
          showCheckbox={false}
          icon={<PenTool size={16} aria-hidden />}
          onSelect={onCycleSignedFilter}
          trailing={
            <FilterLevelBadge
              label={SIGNED_FILTER_LEVELS[signedFilter]}
              icon={signedLevelIcon(signedFilter)}
            />
          }
        />
      ) : null}
      {showMyJurisdiction ? (
        <CheckboxRow
          label={singleJurisdiction ? "My Jurisdiction" : "My Jurisdictions"}
          showCheckbox={false}
          icon={
            geoEngaged(myJurisdiction, false) ? (
              <Eye size={16} aria-hidden />
            ) : (
              <EyeOff size={16} aria-hidden />
            )
          }
          onSelect={onCycleMyJurisdiction}
          trailing={geoTrailing(myJurisdiction, true, false)}
        />
      ) : null}
      {showAffected ? (
        <CheckboxRow
          label="Affected"
          showCheckbox={false}
          icon={
            geoEngaged(affected, geoAutoDisabled === "affected") ? (
              <Eye size={16} aria-hidden />
            ) : (
              <EyeOff size={16} aria-hidden />
            )
          }
          onSelect={onCycleAffected}
          trailing={geoTrailing(
            affected,
            true,
            geoAutoDisabled === "affected",
          )}
        />
      ) : null}
      <CheckboxRow
        label={singleJurisdiction ? "My District" : "My Districts"}
        showCheckbox={false}
        icon={
          geoEngaged(myDistricts, geoAutoDisabled === "myDistricts") ? (
            <Eye size={16} aria-hidden />
          ) : (
            <EyeOff size={16} aria-hidden />
          )
        }
        disabled={!canMyDistricts}
        onSelect={canMyDistricts ? onCycleMyDistricts : undefined}
        trailing={geoTrailing(
          myDistricts,
          canMyDistricts,
          geoAutoDisabled === "myDistricts",
        )}
      />
    </div>
  );
}
