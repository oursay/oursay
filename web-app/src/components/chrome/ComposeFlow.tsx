"use client";

import { useEffect, useState } from "react";
import { BarChart3, Check, ChevronDown } from "lucide-react";
import { jurisdictionIconForName } from "@/lib/jurisdiction-icon";
import {
  composeTypeLockReason,
  rootTypesForJurisdiction,
} from "@/lib/compose-eligibility";
import {
  Button,
  CollapsibleSection,
  Modal,
  ModalField,
  ModalOptionRow,
  PollComposeBody,
} from "@/components/ui";
import { RECORD_TYPE_ICON, RECORD_TYPE_LABEL } from "@/components/content";
import type { RecordKind, VerificationTier } from "@/lib/types";

export type ComposeStep = "where" | "type" | "compose";

interface ComposeFlowProps {
  open: boolean;
  onClose: () => void;
  step: ComposeStep;
  /** Jurisdictions the viewer can post in (the "where" step, skipped with one). */
  jurisdictions: string[];
  kycTier: VerificationTier;
  selectedJurisdiction?: string;
  onSelectJurisdiction: (name: string) => void;
  /** Root types allowed in the selected jurisdiction. */
  allowedTypes: RecordKind[];
  selectedType?: RecordKind;
  onSelectType: (kind: RecordKind) => void;
  onChangeType?: () => void;
  /** Submits (Global) or opens the passkey confirmation (Alberta). */
  onPost?: () => void;
}

const PICKER_TITLES: Record<"where" | "type", string> = {
  where: "Where Do You Want to Post?",
  type: "What Do You Want to Post?",
};

/**
 * Compose flow: jurisdiction pick -> type pick -> type-specific editor.
 *
 * Wireframe note: the compose editor used a generic "New Post" title plus a
 * separate TYPE row (icon + label + Change). The web app supersedes that —
 * the header is "New {Statement|Petition|Poll}" with the type icon and
 * Change inline, so the body starts at POSTING IN / fields.
 */
export function ComposeFlow({
  open,
  onClose,
  step,
  jurisdictions,
  kycTier,
  selectedJurisdiction,
  onSelectJurisdiction,
  allowedTypes,
  selectedType,
  onSelectType,
  onChangeType,
  onPost,
}: ComposeFlowProps) {
  const [jurMenuOpen, setJurMenuOpen] = useState(false);
  // Wireframe state.pollOptions — starts at the 2-option minimum.
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  // Alberta petition: optional attached poll (Alberta has no poll root type).
  const [petitionPollOpen, setPetitionPollOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setJurMenuOpen(false);
      setPollOptions(["", ""]);
      setPetitionPollOpen(false);
    }
  }, [open]);

  const picker = step === "where" || step === "type";
  const JurIcon = selectedJurisdiction
    ? jurisdictionIconForName(selectedJurisdiction)
    : null;

  const ComposeTypeIcon = selectedType ? RECORD_TYPE_ICON[selectedType] : null;

  const composeHeader =
    step === "compose" && selectedType && ComposeTypeIcon ? (
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <ComposeTypeIcon size={16} className="shrink-0 text-ink-soft" aria-hidden />
          <h2 className="truncate text-base font-bold text-ink">
            New {RECORD_TYPE_LABEL[selectedType]}
          </h2>
        </div>
        {(selectedJurisdiction
          ? rootTypesForJurisdiction(selectedJurisdiction)
          : allowedTypes
        ).length > 1 ? (
          <button
            type="button"
            className="shrink-0 text-xs text-ink-soft underline underline-offset-2 hover:text-ink"
            onClick={() => {
              setJurMenuOpen(false);
              onChangeType?.();
            }}
          >
            Change
          </button>
        ) : null}
      </div>
    ) : undefined;

  const composeAriaLabel = selectedType
    ? `New ${RECORD_TYPE_LABEL[selectedType]}`
    : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={picker ? PICKER_TITLES[step] : undefined}
      header={composeHeader}
      ariaLabel={composeAriaLabel}
      subtitle={
        step === "where"
          ? "Pick a jurisdiction"
          : step === "type"
            ? `In ${selectedJurisdiction}`
            : undefined
      }
      headerAlign={picker ? "center" : "left"}
      size={step === "compose" ? "dialog" : "picker"}
      showDismissHint={step === "compose"}
    >
      {step === "where" ? (
        <div className="space-y-2">
          {jurisdictions.map((name) => {
            const Icon = jurisdictionIconForName(name);
            return (
              <ModalOptionRow
                key={name}
                label={name}
                icon={<Icon size={18} aria-hidden />}
                onClick={() => onSelectJurisdiction(name)}
              />
            );
          })}
        </div>
      ) : null}

      {step === "type" ? (
        <div className="space-y-2">
          {allowedTypes.map((kind) => {
            const Icon = RECORD_TYPE_ICON[kind];
            const lockReason =
              selectedJurisdiction !== undefined
                ? composeTypeLockReason(selectedJurisdiction, kind, kycTier)
                : undefined;
            const locked = lockReason !== undefined && lockReason !== "type N/A";
            return (
              <ModalOptionRow
                key={kind}
                label={RECORD_TYPE_LABEL[kind]}
                icon={<Icon size={18} aria-hidden />}
                trailing={locked ? lockReason : undefined}
                disabled={locked}
                onClick={() => onSelectType(kind)}
              />
            );
          })}
        </div>
      ) : null}

      {step === "compose" && selectedType ? (
        <div className="space-y-4">
          {selectedJurisdiction && JurIcon ? (
            <div className="relative">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
                Posting in
              </p>
              <button
                type="button"
                aria-expanded={jurMenuOpen}
                aria-haspopup="listbox"
                onClick={() => setJurMenuOpen((open) => !open)}
                className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 text-sm font-medium text-ink hover:bg-surface"
              >
                <JurIcon size={18} className="shrink-0 text-ink-soft" aria-hidden />
                <span className="flex-1 text-left">{selectedJurisdiction}</span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-muted transition-transform ${jurMenuOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {jurMenuOpen ? (
                <ul
                  role="listbox"
                  aria-label="Posting jurisdiction"
                  className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border-strong bg-surface py-1 shadow-lg"
                >
                  {jurisdictions.map((name) => {
                    const Icon = jurisdictionIconForName(name);
                    const lockReason = selectedType
                      ? composeTypeLockReason(name, selectedType, kycTier)
                      : undefined;
                    const eligible = lockReason === undefined;
                    const selected = name === selectedJurisdiction;
                    return (
                      <li key={name} role="option" aria-selected={selected}>
                        <button
                          type="button"
                          disabled={!eligible}
                          onClick={() => {
                            if (!eligible) return;
                            onSelectJurisdiction(name);
                            setJurMenuOpen(false);
                          }}
                          className={`flex min-h-9 w-full items-center gap-2 px-3 text-left text-sm ${
                            eligible
                              ? "text-ink hover:bg-surface-muted"
                              : "cursor-not-allowed text-muted"
                          }`}
                        >
                          <Icon
                            size={16}
                            className={eligible ? "text-ink-soft" : "text-muted"}
                            aria-hidden
                          />
                          <span className="flex-1">{name}</span>
                          {lockReason ? (
                            <span className="shrink-0 text-[10px] text-muted">
                              {lockReason}
                            </span>
                          ) : selected ? (
                            <Check size={14} className="shrink-0 text-ink" aria-hidden />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}

          {selectedType === "poll" ? (
            <PollComposeBody options={pollOptions} onChange={setPollOptions} />
          ) : (
            <>
              <ModalField
                label="Title"
                placeholder={
                  selectedType === "petition"
                    ? "What are you calling for?"
                    : "A clear headline…"
                }
              />
              <ModalField
                label="Body"
                placeholder={
                  selectedType === "petition"
                    ? "Write your petition…"
                    : "Write your statement…"
                }
                multiline
                rows={4}
              />
            </>
          )}

          {selectedType === "petition" ? (
            <ModalField
              label="Support statement (signature button)"
              defaultValue="Sign the Petition"
              maxLength={60}
              showCount
              hint={'Defaults to "Sign the Petition" · editable, max 60'}
            />
          ) : null}

          {selectedType === "petition" && selectedJurisdiction === "Alberta" ? (
            <CollapsibleSection
              icon={BarChart3}
              label="Add a Poll (optional)"
              open={petitionPollOpen}
              onToggle={() => setPetitionPollOpen((o) => !o)}
              count={petitionPollOpen ? undefined : "off"}
            >
              <PollComposeBody
                options={pollOptions}
                onChange={setPollOptions}
                questionLabel="Poll question"
                questionPlaceholder="Ask signers a follow-up question…"
              />
            </CollapsibleSection>
          ) : null}

          <Button fullWidth onClick={onPost}>
            Post
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}
