"use client";

import { useMemo, useState } from "react";
import { Mail, RotateCcw } from "lucide-react";
import { Button, Modal, ModalField } from "@/components/ui";
import { isValidEmailFormat } from "@/lib/email";

interface RecoverFormData {
  email: string;
}

interface RecoverFormProps {
  open: boolean;
  onClose: () => void;
  /** Advances to the OTP step. */
  onSubmit?: (data?: RecoverFormData) => void;
  /** Optional initial email prefill (e.g. deep-link). */
  email?: string;
}

/** Recovery step 1 — email-only request for a recovery code. */
export function RecoverForm({ open, onClose, onSubmit, email }: RecoverFormProps) {
  const [draftEmail, setDraftEmail] = useState(email ?? "");
  const [attempted, setAttempted] = useState(false);

  const normalizedEmail = useMemo(() => draftEmail.trim(), [draftEmail]);
  const valid = isValidEmailFormat(normalizedEmail);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Recover Account"
      subtitle="Verify email · re-enroll a passkey"
      headerAlign="center"
    >
      <div className="space-y-4">
        <ModalField
          label="Email"
          placeholder="jane@example.ca"
          value={draftEmail}
          onChange={(e) => {
            setDraftEmail(e.target.value);
            if (attempted) setAttempted(false);
          }}
        />

        {attempted && !valid ? (
          <p className="text-sm text-danger-700" role="alert">
            Enter a valid email address.
          </p>
        ) : null}

        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex items-start gap-3">
            <Mail size={18} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">We&apos;ll email you a 6-digit code</p>
              <p className="text-xs text-muted">
                Verify it on the next step, then register a passkey to log in again.
              </p>
            </div>
          </div>
        </div>

        <Button
          fullWidth
          icon={RotateCcw}
          disabled={!valid}
          onClick={() => {
            setAttempted(true);
            if (!valid) return;
            onSubmit?.({ email: normalizedEmail });
          }}
        >
          Send Recovery Code
        </Button>
      </div>
    </Modal>
  );
}

