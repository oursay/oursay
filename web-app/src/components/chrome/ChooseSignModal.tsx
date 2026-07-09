"use client";

import { Key, Signature } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import type { PasskeyBusyPhase } from "@/lib/state/passkeyBusy";

interface ChooseSignModalProps {
  open: boolean;
  onClose: () => void;
  /** Bold summary line, e.g. "Cast your vote". */
  title: string;
  /** Supporting lines naming the target/option. */
  lines: string[];
  /** Derived-key quick sign (no authenticator prompt). */
  onQuickSign?: () => void;
  /** WebAuthn passkey sign. */
  onPasskeySign?: () => void;
  passkeyBusy?: PasskeyBusyPhase | null;
}

/**
 * "Ask" signing chooser — shown when an action's effective method is `ask`
 * (the account default is Ask and the jurisdiction doesn't mandate passkey).
 * The signer picks Quick Sign or Sign with Passkey; either completes the action.
 */
export function ChooseSignModal({
  open,
  onClose,
  title,
  lines,
  onQuickSign,
  onPasskeySign,
  passkeyBusy = null,
}: ChooseSignModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How do you want to sign?"
      headerAlign="center"
      passkeyBusy={passkeyBusy}
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-surface-muted p-4 text-center text-sm leading-relaxed text-ink">
          <p className="font-semibold">{title}</p>
          {lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>

        <Button fullWidth variant="outline" icon={Signature} onClick={onQuickSign}>
          Quick Sign
        </Button>
        <Button fullWidth icon={Key} onClick={onPasskeySign}>
          Sign with Passkey
        </Button>

        <p className="text-center text-xs text-muted">
          Quick signs instantly (no authenticator prompt) · Passkey prompts your authenticator.
        </p>
      </div>
    </Modal>
  );
}
