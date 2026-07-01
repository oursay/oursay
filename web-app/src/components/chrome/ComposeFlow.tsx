"use client";

import { Building2, Globe } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { RECORD_TYPE_ICON, RECORD_TYPE_LABEL } from "@/components/content";
import type { RecordKind } from "@/lib/types";

export type ComposeStep = "where" | "type" | "compose";

interface ComposeFlowProps {
  open: boolean;
  onClose: () => void;
  step: ComposeStep;
  /** Jurisdictions the viewer can post in (the "where" step, skipped with one). */
  jurisdictions: string[];
  selectedJurisdiction?: string;
  onSelectJurisdiction: (name: string) => void;
  /** Root types allowed in the selected jurisdiction. */
  allowedTypes: RecordKind[];
  /** Types shown but disabled (e.g. Alberta Petition for a non-residency account). */
  lockedTypes?: RecordKind[];
  selectedType?: RecordKind;
  onSelectType: (kind: RecordKind) => void;
  onChangeType?: () => void;
  /** Submits (Global) or opens the passkey confirmation (Alberta). */
  onPost?: () => void;
}

const TITLES: Record<ComposeStep, string> = {
  where: "Where Do You Want to Post?",
  type: "What Do You Want to Post?",
  compose: "New Post",
};

/** Compose flow: jurisdiction pick -> type pick -> type-specific editor. */
export function ComposeFlow({
  open,
  onClose,
  step,
  jurisdictions,
  selectedJurisdiction,
  onSelectJurisdiction,
  allowedTypes,
  lockedTypes = [],
  selectedType,
  onSelectType,
  onChangeType,
  onPost,
}: ComposeFlowProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={TITLES[step]}
      subtitle={step === "type" ? `In ${selectedJurisdiction}` : undefined}
    >
      {step === "where" ? (
        <div className="mt-2 space-y-2">
          {jurisdictions.map((name) => {
            const Icon = name === "Global" ? Globe : Building2;
            return (
              <button
                key={name}
                type="button"
                onClick={() => onSelectJurisdiction(name)}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border px-3 text-sm text-ink hover:bg-surface-muted"
              >
                <Icon size={16} aria-hidden />
                {name}
              </button>
            );
          })}
        </div>
      ) : null}

      {step === "type" ? (
        <div className="mt-2 space-y-2">
          {allowedTypes.map((kind) => {
            const Icon = RECORD_TYPE_ICON[kind];
            const locked = lockedTypes.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                disabled={locked}
                onClick={() => onSelectType(kind)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${locked ? "text-muted" : "text-ink"}`}
              >
                <Icon size={16} aria-hidden />
                {RECORD_TYPE_LABEL[kind]}
                {locked ? (
                  <span className="ml-auto text-xs">Residency-verified only</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {step === "compose" && selectedType ? (
        <div className="mt-2 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              Type
            </span>
            <span className="font-medium text-ink">
              {RECORD_TYPE_LABEL[selectedType]}
            </span>
            <span className="ml-auto">
              <Button variant="outline" size="sm" onClick={onChangeType}>
                Change
              </Button>
            </span>
          </div>

          <input
            type="text"
            placeholder={
              selectedType === "poll" ? "Ask a question…" : "Title"
            }
            className="w-full rounded-md border border-border bg-surface-muted px-2.5 py-2 text-sm text-ink placeholder:text-muted"
          />

          {selectedType === "poll" ? (
            <div className="space-y-2">
              {["Option 1", "Option 2"].map((ph) => (
                <input
                  key={ph}
                  type="text"
                  placeholder={ph}
                  className="w-full rounded-md border border-border bg-surface-muted px-2.5 py-2 text-sm text-ink placeholder:text-muted"
                />
              ))}
              <p className="text-xs text-muted">2–10 options.</p>
            </div>
          ) : (
            <textarea
              rows={4}
              placeholder="Write your post…"
              className="w-full rounded-md border border-border bg-surface-muted px-2.5 py-2 text-sm text-ink placeholder:text-muted"
            />
          )}

          {selectedType === "petition" ? (
            <input
              type="text"
              maxLength={60}
              placeholder="One-line support statement (max 60 chars)"
              className="w-full rounded-md border border-border bg-surface-muted px-2.5 py-2 text-sm text-ink placeholder:text-muted"
            />
          ) : null}

          <Button fullWidth onClick={onPost}>
            Post
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}
