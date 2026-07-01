"use client";

import { Building2, ExternalLink, Globe, Plus } from "lucide-react";
import { CheckboxRow } from "@/components/ui";
import type { JurisdictionMembership } from "@/lib/types";

interface JurisdictionSelectorProps {
  subscriptions: JurisdictionMembership[];
  onToggleInclude: (name: string) => void;
  /** Tap a name -> show only that jurisdiction's feed. */
  onSelectOnly: (name: string) => void;
  /** Tap the external-link glyph -> open that jurisdiction's view. */
  onOpenJurisdiction: (name: string) => void;
  onAddJurisdiction: () => void;
}

/**
 * The jurisdiction scope selector. Checkboxes appear only with more than one
 * subscription (at least one always stays included). Each row links out to its
 * Jurisdiction view; a dashed "Add Jurisdiction" button opens the spotlight.
 */
export function JurisdictionSelector({
  subscriptions,
  onToggleInclude,
  onSelectOnly,
  onOpenJurisdiction,
  onAddJurisdiction,
}: JurisdictionSelectorProps) {
  const multi = subscriptions.length > 1;
  const includedCount = subscriptions.filter((s) => s.included).length;

  return (
    <div className="w-72 rounded-xl border border-border-strong bg-surface p-2 shadow-lg">
      {subscriptions.map((sub) => {
        const isLast = includedCount <= 1 && sub.included;
        const Icon = sub.name === "Global" ? Globe : Building2;
        return (
          <CheckboxRow
            key={sub.name}
            label={sub.name}
            checked={sub.included}
            showCheckbox={multi}
            icon={<Icon size={16} aria-hidden />}
            onToggle={() => {
              if (isLast) return;
              onToggleInclude(sub.name);
            }}
            onSelect={() => onSelectOnly(sub.name)}
            trailing={
              <button
                type="button"
                aria-label={`Open ${sub.name}`}
                onClick={() => onOpenJurisdiction(sub.name)}
                className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-ink-soft"
              >
                <ExternalLink size={15} aria-hidden />
              </button>
            }
          />
        );
      })}
      <button
        type="button"
        onClick={onAddJurisdiction}
        className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-sm font-medium text-ink-soft hover:bg-surface-muted"
      >
        <Plus size={16} aria-hidden />
        Add Jurisdiction
      </button>
    </div>
  );
}
