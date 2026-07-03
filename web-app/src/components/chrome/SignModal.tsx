"use client";

import { AlertTriangle, Key } from "lucide-react";
import { Button, Modal, NoticeBox } from "@/components/ui";

export type SignKind =
  | "petition"
  | "poll"
  | "compose"
  | "comment"
  | "reaction";

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
  /**
   * Whether the jurisdiction makes this action ledger-final. Drives the FINAL
   * warning and the residency/affected notices (which speak to the official
   * count). A standing passkey preference on a non-final jurisdiction is false.
   */
  isFinal?: boolean;
  /** Jurisdiction name for copy ("…in {jurisdiction}", "{jurisdiction} votes are FINAL"). */
  jurisdiction?: string;
  /** Below-residency signer: their action won't count officially yet. */
  showResidencyNotice?: boolean;
  /** Residency-verified but outside the record's districts. */
  showAffectedNotice?: boolean;
  onConfirm?: () => void;
}

function title(kind: SignKind): string {
  switch (kind) {
    case "petition":
      return "Confirm your signature";
    case "poll":
      return "Confirm your vote";
    case "comment":
      return "Confirm your comment";
    case "reaction":
      return "Confirm your reaction";
    default:
      return "Confirm your submission";
  }
}

function statementLines(
  kind: SignKind,
  name: string,
  targetTitle: string,
  option: string | undefined,
  composeTypeLabel: string | undefined,
  jurisdiction: string,
): string[] {
  switch (kind) {
    case "petition":
      return [
        `I, ${name}, am signing my official`,
        "support for the petition:",
        `“${targetTitle}”`,
      ];
    case "poll":
      return [
        `I, ${name}, am casting my official`,
        `vote — “${option}” — on:`,
        `“${targetTitle}”`,
      ];
    case "comment":
      return [`I, ${name}, am posting my`, "comment on:", `“${targetTitle}”`];
    case "reaction":
      return [`I, ${name}, am recording my`, "reaction on:", `“${targetTitle}”`];
    default:
      return [
        `I, ${name}, am publishing this`,
        `${composeTypeLabel ?? "post"} in ${jurisdiction},`,
        "signed and written to the public ledger.",
      ];
  }
}

/**
 * "What you see is what you sign" (WYSIWYS) passkey confirmation. Shows the
 * exact action in plain language, plus a passkey button (stub). Used both for
 * jurisdiction-mandated passkey (Alberta — `isFinal`, with the FINAL /
 * residency / affected notices) and for a standing account passkey preference
 * on any jurisdiction (no FINAL box).
 */
export function SignModal({
  open,
  onClose,
  kind,
  signerName,
  targetTitle,
  option,
  composeTypeLabel,
  isFinal = true,
  jurisdiction = "Alberta",
  showResidencyNotice = false,
  showAffectedNotice = false,
  onConfirm,
}: SignModalProps) {
  const what = kind === "petition" ? "signatures" : "votes";

  return (
    <Modal open={open} onClose={onClose} title={title(kind)} headerAlign="center">
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-surface-muted p-4 text-center text-sm leading-relaxed text-ink">
          {statementLines(
            kind,
            signerName,
            targetTitle,
            option,
            composeTypeLabel,
            jurisdiction,
          ).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>

        {isFinal ? (
          <NoticeBox
            tone="danger"
            icon={<AlertTriangle size={16} aria-hidden />}
            lines={[
              `${jurisdiction} ${what} are FINAL —`,
              "they cannot be changed or revoked.",
            ]}
          />
        ) : null}

        {isFinal && showResidencyNotice ? (
          <NoticeBox
            tone="notice"
            lines={[
              `OurSay official counts for ${jurisdiction}`,
              "only include verified residents —",
              `this ${kind === "petition" ? "signature" : "vote"} won't count until you verify.`,
            ]}
          />
        ) : null}

        {isFinal && showAffectedNotice ? (
          <NoticeBox
            tone="info"
            lines={[
              `Officials can filter ${kind === "petition" ? "signatures" : "poll results"} to exclude`,
              "unaffected users, even though OurSay",
              "includes you in the official count.",
            ]}
          />
        ) : null}

        <Button fullWidth icon={Key} onClick={onConfirm}>
          Sign with Passkey
        </Button>
      </div>
    </Modal>
  );
}
