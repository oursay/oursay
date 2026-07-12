"use client";

import { useState } from "react";
import { Loader2, ScanFace } from "lucide-react";
import { Button, Modal } from "@/components/ui";

interface RecoveryKycModalProps {
  open: boolean;
  onClose: () => void;
  onStart: () => void | Promise<void>;
  busy?: boolean;
}

/** Verified-account recovery: biometric Didit step before passkey re-enroll. */
export function RecoveryKycModal({
  open,
  onClose,
  onStart,
  busy = false,
}: RecoveryKycModalProps) {
  const [starting, setStarting] = useState(false);
  const loading = busy || starting;

  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      title="Confirm it’s you"
      headerAlign="center"
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          This account is identity-verified. Complete a quick face check so a stolen email inbox
          cannot take over your verified standing.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-3 text-sm text-muted">
            <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
            Waiting for biometric verification…
          </div>
        ) : (
          <Button
            fullWidth
            icon={ScanFace}
            onClick={() => {
              setStarting(true);
              void (async () => {
                try {
                  await onStart();
                } finally {
                  setStarting(false);
                }
              })();
            }}
          >
            Start face check
          </Button>
        )}
      </div>
    </Modal>
  );
}
