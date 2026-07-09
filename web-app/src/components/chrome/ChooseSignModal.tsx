"use client";

import { Key, Signature } from "lucide-react";
import { WysiwysPreview } from "@/components/signing";
import { Button, Modal } from "@/components/ui";
import type { WysiwysPayload } from "@/lib/signing";
import type { PasskeyBusyPhase } from "@/lib/state/passkeyBusy";

interface ChooseSignModalProps {
  open: boolean;
  onClose: () => void;
  /** WYSIWYS preview payload (title used as modal header). */
  wysiwys: WysiwysPayload;
  /** When false, only Sign with Passkey is shown (jurisdiction or account mandates passkey). */
  showQuickSign: boolean;
  onQuickSign?: () => void;
  onPasskeySign?: () => void;
  passkeyBusy?: PasskeyBusyPhase | null;
}

/**
 * Unified civic signing confirmation — embeds WYSIWYS and offers Quick Sign
 * and/or Sign with Passkey depending on the effective signing method.
 */
export function ChooseSignModal({
  open,
  onClose,
  wysiwys,
  showQuickSign,
  onQuickSign,
  onPasskeySign,
  passkeyBusy = null,
}: ChooseSignModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={wysiwys.title}
      headerAlign="center"
      passkeyBusy={passkeyBusy}
    >
      <div className="space-y-3">
        <WysiwysPreview {...wysiwys} />

        {showQuickSign ? (
          <Button fullWidth variant="outline" icon={Signature} onClick={onQuickSign}>
            Quick Sign
          </Button>
        ) : null}
        <Button fullWidth icon={Key} onClick={onPasskeySign}>
          Sign with Passkey
        </Button>

        {showQuickSign ? (
          <p className="text-center text-xs text-muted">
            Quick signs instantly (no authenticator prompt) · Passkey prompts your authenticator.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
