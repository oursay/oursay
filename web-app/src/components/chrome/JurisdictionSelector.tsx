"use client";

import { ExternalLink, Newspaper, Plus } from "lucide-react";
import { jurisdictionIconForName } from "@/lib/jurisdiction-icon";
import type { JurisdictionMembership } from "@/lib/types";
import { CheckboxIndicator, CheckboxRow } from "@/components/ui";

interface JurisdictionSelectorProps {
  subscriptions: JurisdictionMembership[];
  onToggleInclude: (name: string) => void;
  /** Include every subscribed jurisdiction (wireframe "all subs" row). */
  onAllJurisdictions: () => void;
  /** Tap a name -> show only that jurisdiction's feed. */
  onSelectOnly: (name: string) => void;
  /** Tap the external-link glyph -> open that jurisdiction's view. */
  onOpenJurisdiction: (name: string) => void;
  onAddJurisdiction: () => void;
}

const ROW_CELL =
  "flex min-h-11 items-center rounded-lg hover:bg-surface-muted";

/**
 * The jurisdiction scope selector. Checkboxes appear only with more than one
 * subscription (at least one always stays included). Each row links out to its
 * Jurisdiction view; a dashed "Add Jurisdiction" button opens the spotlight.
 *
 * Panel width hugs content: as wide as the longest jurisdiction row or the add
 * button, whichever is longer. Rows use a shared grid so checkboxes and external
 * links align at the edges while icon + label stay centred in the middle.
 */
export function JurisdictionSelector({
  subscriptions,
  onToggleInclude,
  onAllJurisdictions,
  onSelectOnly,
  onOpenJurisdiction,
  onAddJurisdiction,
}: JurisdictionSelectorProps) {
  const multi = subscriptions.length > 1;
  const includedCount = subscriptions.filter((s) => s.included).length;

  return (
    <div className="inline-grid w-max max-w-[calc(100vw-1.5rem)] grid-cols-[1.25rem_minmax(max-content,1fr)_max-content] gap-x-1.5 rounded-xl border border-border-strong bg-surface p-2 shadow-lg">
      {multi ? (
        <div className="col-span-3">
          <CheckboxRow
            label="All Jurisdictions"
            showCheckbox={false}
            icon={<Newspaper size={16} aria-hidden />}
            onSelect={onAllJurisdictions}
          />
        </div>
      ) : null}
      {subscriptions.map((sub) => {
        const isLast = includedCount <= 1 && sub.included;
        const Icon = jurisdictionIconForName(sub.name);
        return (
          <div key={sub.name} className="contents">
            {multi ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={sub.included}
                aria-label={sub.name}
                onClick={() => {
                  if (isLast) return;
                  onToggleInclude(sub.name);
                }}
                className={`${ROW_CELL} justify-center`}
              >
                <CheckboxIndicator checked={sub.included} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onSelectOnly(sub.name)}
              className={`${ROW_CELL} gap-1.5 whitespace-nowrap px-1 ${
                multi ? "justify-center" : "col-span-2 justify-start"
              }`}
            >
              <Icon size={16} className="shrink-0 text-ink-soft" aria-hidden />
              <span className="text-sm text-ink">{sub.name}</span>
            </button>
            <button
              type="button"
              aria-label={`Open ${sub.name}`}
              onClick={() => onOpenJurisdiction(sub.name)}
              className={`${ROW_CELL} justify-end self-stretch pl-1`}
            >
              <ExternalLink size={15} className="text-muted" aria-hidden />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAddJurisdiction}
        className="col-span-3 mt-1 flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-dashed border-border-strong px-3 text-sm font-medium text-ink-soft hover:bg-surface-muted"
      >
        <Plus size={16} aria-hidden />
        Add Jurisdiction
      </button>
    </div>
  );
}
