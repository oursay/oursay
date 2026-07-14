"use client";

import { useState } from "react";
import { IdCard, Loader2, MapPin } from "lucide-react";
import { Button, Modal } from "@/components/ui";

export type VerifyChoice = "identity" | "poa";

interface VerifyModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user picks a path; parent runs stub Didit-mimic or Didit hosted flow. */
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
    <Modal open={open} onClose={loading ? () => undefined : onClose} title="Get Verified">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-ink">
            You have the right to participate anonymously
          </p>
          <p className="mt-1 text-xs text-muted">
            Getting verified unlocks more access and visibility — home-district posts,
            residency voting, and a verification badge on your contributions.
          </p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-3 text-sm text-muted">
            <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
            {pending === "poa"
              ? "Opening residency verification…"
              : "Opening identity verification…"}
          </div>
        ) : (
          <div className="space-y-2">
            <Button fullWidth icon={MapPin} onClick={() => void pick("poa")}>
              Verify Residency
            </Button>
            <Button
              fullWidth
              variant="outline"
              icon={IdCard}
              onClick={() => void pick("identity")}
            >
              Verify Identity
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
