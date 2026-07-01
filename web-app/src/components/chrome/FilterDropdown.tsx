"use client";

import { BadgeCheck, Eye, EyeOff, List } from "lucide-react";
import { RECORD_TYPE_ICON, RECORD_TYPE_LABEL } from "@/components/content";
import { CheckboxRow } from "@/components/ui";
import { VERIFIED_LEVELS } from "@/lib/types";
import type { RecordKind, VerificationTier, ViewerContext } from "@/lib/types";

const ALL_KINDS: RecordKind[] = ["statement", "petition", "poll", "result"];

interface FilterDropdownProps {
  includedKinds: RecordKind[];
  onToggleKind: (kind: RecordKind) => void;
  onIsolateKind: (kind: RecordKind) => void;
  onAllKinds: () => void;
  /** Verified ladder index into VERIFIED_LEVELS (None -> ID -> Residency -> Official). */
  verifiedLevel: VerificationTier;
  onCycleVerified: () => void;
  myDistricts: boolean;
  onToggleMyDistricts: () => void;
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
          <span className="text-xs text-ink-soft">
            {VERIFIED_LEVELS[verifiedLevel]}
          </span>
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
