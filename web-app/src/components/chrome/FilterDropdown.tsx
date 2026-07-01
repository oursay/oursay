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
import { RECORD_TYPE_ICON, RECORD_TYPE_LABEL } from "@/components/content";
import { CheckboxRow } from "@/components/ui";
import { VERIFIED_LEVELS, SIGNED_FILTER_LEVELS } from "@/lib/types";
import type { RecordKind, SignedFilterLevel, VerificationTier, ViewerContext } from "@/lib/types";

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

interface FilterDropdownProps {
  includedKinds: RecordKind[];
  onToggleKind: (kind: RecordKind) => void;
  onIsolateKind: (kind: RecordKind) => void;
  onAllKinds: () => void;
  /** Verified ladder index into VERIFIED_LEVELS (Any -> Identity -> Residency -> Official). */
  verifiedLevel: VerificationTier;
  onCycleVerified: () => void;
  myDistricts: boolean;
  onToggleMyDistricts: () => void;
  /** Signed ladder: 0 Any · 1 Passkey · 2 Biometric (Biometric dev-only in cycle). */
  signedFilter?: SignedFilterLevel;
  onCycleSignedFilter?: () => void;
  /** Affected geography row only shows on a qualifying open post. */
  showAffected?: boolean;
  affected?: boolean;
  onToggleAffected?: () => void;
  /** Hide the record-type section (Post / Profile show the Refine ladder only). */
  showRecordTypes?: boolean;
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
  onToggleMyDistricts,
  signedFilter = 0,
  onCycleSignedFilter,
  showAffected = false,
  affected = false,
  onToggleAffected,
  showRecordTypes = true,
  viewer,
}: FilterDropdownProps) {
  // My Districts / Affected are only inferable for a residency-verified viewer
  // once the Verified ladder is at Residency+ (§4.4).
  const canGeography = viewer.kycTier >= 2;
  const geographyInferable = verifiedLevel >= 2;

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
      <CheckboxRow
        label="My Districts"
        showCheckbox={false}
        icon={
          myDistricts && geographyInferable ? (
            <Eye size={16} aria-hidden />
          ) : (
            <EyeOff size={16} aria-hidden />
          )
        }
        disabled={!canGeography}
        onSelect={canGeography ? onToggleMyDistricts : undefined}
        trailing={
          !canGeography ? (
            <span className="text-xs text-muted">Residency only</span>
          ) : !geographyInferable ? (
            <span className="text-xs text-muted">Residency+</span>
          ) : null
        }
      />
      {showAffected ? (
        <CheckboxRow
          label="Affected"
          showCheckbox={false}
          icon={
            affected && geographyInferable ? (
              <Eye size={16} aria-hidden />
            ) : (
              <EyeOff size={16} aria-hidden />
            )
          }
          disabled={!canGeography}
          onSelect={canGeography ? onToggleAffected : undefined}
          trailing={
            !canGeography ? (
              <span className="text-xs text-muted">Residency only</span>
            ) : !geographyInferable ? (
              <span className="text-xs text-muted">Residency+</span>
            ) : null
          }
        />
      ) : null}
    </div>
  );
}
