"use client";

import { AlertTriangle, KeyRound } from "lucide-react";
import { Button, Modal, NoticeBox } from "@/components/ui";

export type SignKind = "petition" | "poll" | "compose";

interface SignModalProps {
  open: boolean;
  onClose: () => void;
  kind: SignKind;
  /** The signer's own display name ("I, {name}, am signing…"). */
  signerName: string;
  /** The record being signed/voted on / published. */
  targetTitle: string;
  /** Poll: the option being cast. */
  option?: string;
  /** Compose: the record type being published (e.g. "Statement"). */
  composeTypeLabel?: string;
  /** Below-residency signer: their action won't count officially yet. */
  showResidencyNotice?: boolean;
  /** Residency-verified but outside the record's districts. */
  showAffectedNotice?: boolean;
  onConfirm?: () => void;
}

function title(kind: SignKind): string {
  if (kind === "petition") return "Confirm your signature";
  if (kind === "poll") return "Confirm your vote";
  return "Confirm your submission";
}

function statementLines(
  kind: SignKind,
  name: string,
  targetTitle: string,
  option: string | undefined,
  composeTypeLabel: string | undefined,
): string[] {
  if (kind === "petition") {
    return [
      `I, ${name}, am signing my official`,
      "support for the petition:",
      `“${targetTitle}”`,
    ];
  }
  if (kind === "poll") {
    return [
      `I, ${name}, am casting my official`,
      `vote — “${option}” — on:`,
      `“${targetTitle}”`,
    ];
  }
  return [
    `I, ${name}, am publishing this`,
    `${composeTypeLabel ?? "post"} in Alberta,`,
    "signed and written to the public ledger.",
  ];
}

/**
 * Alberta "what you see is what you sign" (WYSIWYS) passkey confirmation. Shows
 * the exact action in plain language, plus the FINAL / residency / affected
 * notices, then a passkey button (stub). Only petition/poll carry the FINAL box.
 */
export function SignModal({
  open,
  onClose,
  kind,
  signerName,
  targetTitle,
  option,
  composeTypeLabel,
  showResidencyNotice = false,
  showAffectedNotice = false,
  onConfirm,
}: SignModalProps) {
  const isFinal = kind !== "compose";
  const what = kind === "petition" ? "signatures" : "votes";

  return (
    <Modal open={open} onClose={onClose} title={title(kind)}>
      <div className="mt-2 space-y-3">
        <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm text-ink">
          {statementLines(kind, signerName, targetTitle, option, composeTypeLabel).map(
            (line, i) => (
              <p key={i}>{line}</p>
            ),
          )}
        </div>

        {isFinal ? (
          <NoticeBox
            tone="danger"
            icon={<AlertTriangle size={16} aria-hidden />}
            lines={[`Alberta ${what} are FINAL —`, "they cannot be changed or revoked."]}
          />
        ) : null}

        {showResidencyNotice ? (
          <NoticeBox
            tone="notice"
            lines={[
              "OurSay official counts for Alberta",
              "only include verified residents —",
              `this ${kind === "petition" ? "signature" : "vote"} won't count until you verify.`,
            ]}
          />
        ) : null}

        {showAffectedNotice ? (
          <NoticeBox
            tone="info"
            lines={[
              `Officials can filter ${kind === "petition" ? "signatures" : "poll results"} to exclude`,
              "unaffected users, even though OurSay",
              "includes you in the official count.",
            ]}
          />
        ) : null}

        <Button fullWidth icon={KeyRound} onClick={onConfirm}>
          Sign with Passkey
        </Button>
      </div>
    </Modal>
  );
}
