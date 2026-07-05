"use client";

import { KeyRound } from "lucide-react";
import { Button, Modal } from "@/components/ui";

interface OtpVerifyProps {
  open: boolean;
  onClose: () => void;
  email?: string;
  /** Registers this device's passkey and signs in (stub). */
  onRegisterPasskey?: () => void;
  onResend?: () => void;
}

/** OTP entry + Register Passkey step (registration page 2 / recovery). */
export function OtpVerify({
  open,
  onClose,
  email = "jane@example.ca",
  onRegisterPasskey,
  onResend,
}: OtpVerifyProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Verify Your Email"
      subtitle={`Enter the 6-digit code sent to ${email}`}
      headerAlign="center"
    >
      <div className="space-y-4">
        <div className="flex justify-between gap-1.5">
          {[4, 7, 2, 9, 0, 5].map((d, i) => (
            <div
              key={i}
              className="flex h-11 flex-1 items-center justify-center rounded-md border border-border bg-surface-muted text-lg text-muted"
            >
              {d}
            </div>
          ))}
        </div>
        <Button fullWidth icon={KeyRound} onClick={onRegisterPasskey}>
          Register Passkey
        </Button>
        <p className="text-center text-xs text-muted">
          Registers this device&apos;s passkey and signs you in
        </p>
        <button
          type="button"
          onClick={onResend}
          className="block w-full text-center text-sm text-ink-soft underline underline-offset-2"
        >
          Didn&apos;t get a code? Resend
        </button>
      </div>
    </Modal>
  );
}
