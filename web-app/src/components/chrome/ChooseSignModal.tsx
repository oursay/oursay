"use client";

import { Key, Signature } from "lucide-react";
import { Button, Modal } from "@/components/ui";

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
}: ChooseSignModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How do you want to sign?"
      headerAlign="center"
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
          Quick uses your device key · Passkey prompts your authenticator.
        </p>
      </div>
    </Modal>
  );
}
