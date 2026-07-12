"use client";

import { useState } from "react";
import { BadgeCheck, Home, Loader2 } from "lucide-react";
import { Modal, ModalOptionRow } from "@/components/ui";

export type VerifyChoice = "identity" | "poa";

interface VerifyModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user picks a path; parent runs stub cycle or Didit hosted flow. */
  onChoose: (choice: VerifyChoice) => void | Promise<void>;
  busy?: boolean;
}

/**
 * Chooser for identity vs residency verification — replaces a single Validate ID toggle.
 */
export function VerifyModal({
  open,
  onClose,
  onChoose,
  busy = false,
}: VerifyModalProps) {
  const [pending, setPending] = useState<VerifyChoice | null>(null);
  const loading = busy || pending !== null;

  const pick = async (choice: VerifyChoice) => {
    if (loading) return;
    setPending(choice);
    try {
      await onChoose(choice);
    } finally {
      setPending(null);
    }
  };

  return (
    <Modal open={open} onClose={loading ? () => undefined : onClose} title="Get verified">
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Confirm your identity for civic standing. Residency adds proof of address for
          permission to cast ballots or sign petitions in some jurisdictions. Verification
          is free — optional donations help fund the next check.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-3 text-sm text-muted">
            <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
            {pending === "poa"
              ? "Opening residency verification…"
              : "Opening identity verification…"}
          </div>
        ) : (
          <div className="space-y-2">
            <ModalOptionRow
              label="Verify ID"
              icon={<BadgeCheck size={16} aria-hidden />}
              onClick={() => void pick("identity")}
            />
            <ModalOptionRow
              label="Verify Residency"
              icon={<Home size={16} aria-hidden />}
              onClick={() => void pick("poa")}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
