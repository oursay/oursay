"use client";

import { useEffect, useState } from "react";
import { Key, Signature } from "lucide-react";
import { WysiwysPreview } from "@/components/signing";
import { Button, CheckboxIndicator, Modal } from "@/components/ui";
import { warningBlocksSigning, type WysiwysPayload } from "@/lib/signing";
import type { PasskeyBusyPhase } from "@/lib/state/passkeyBusy";

interface ChooseSignModalProps {
  open: boolean;
  onClose: () => void;
  /** WYSIWYS preview payload (title used as modal header). */
  wysiwys: WysiwysPayload;
  /** When false, only Sign with Passkey is shown (jurisdiction or account mandates passkey). */
  showQuickSign: boolean;
  /** Called with whether "Remember my choice" was checked (Ask mode only). */
  onQuickSign?: (remember: boolean) => void;
  onPasskeySign?: (remember: boolean) => void;
  passkeyBusy?: PasskeyBusyPhase | null;
}

/**
 * Unified civic signing confirmation — embeds WYSIWYS and offers Quick Sign
 * and/or Sign with Passkey depending on the effective signing method.
 * In Ask mode, "Remember my choice" persists Quick or Passkey for that action.
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
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (open) setRemember(false);
  }, [open]);

  // A blocking warning (gate or already-acted) means the viewer cannot participate —
  // signing is disabled.
  const blocked = wysiwys.warnings.some((w) => warningBlocksSigning(w.kind));
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
          <button
            type="button"
            role="checkbox"
            aria-checked={remember}
            onClick={() => setRemember((v) => !v)}
            className="flex min-h-5 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-surface-muted"
          >
            <CheckboxIndicator checked={remember} />
            <span
              className={`text-sm text-ink ${remember ? "font-semibold" : "font-normal"}`}
            >
              Remember my choice
            </span>
          </button>
        ) : null}

        {showQuickSign ? (
          <Button
            fullWidth
            variant="outline"
            icon={Signature}
            onClick={() => onQuickSign?.(remember)}
            disabled={blocked}
          >
            Quick Sign
          </Button>
        ) : null}
        <Button
          fullWidth
          icon={Key}
          onClick={() => onPasskeySign?.(showQuickSign ? remember : false)}
          disabled={blocked}
        >
          Sign with Passkey
        </Button>
      </div>
    </Modal>
  );
}
