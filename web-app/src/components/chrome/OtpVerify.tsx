"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button, Modal } from "@/components/ui";

interface OtpVerifyProps {
  open: boolean;
  onClose: () => void;
  email?: string;
  /** Registers this device's passkey and signs in. */
  onRegisterPasskey?: (code: string) => void;
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
  const [code, setCode] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Verify Your Email"
      subtitle={`Enter the 6-digit code sent to ${email}`}
      headerAlign="center"
    >
      <div className="space-y-4">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          className="w-full rounded-lg border border-border bg-surface-muted px-3 py-3 text-center text-lg tracking-[0.3em] text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none"
        />
        <Button
          fullWidth
          icon={KeyRound}
          onClick={() => onRegisterPasskey?.(code)}
          disabled={code.length < 6}
        >
          Register Passkey
        </Button>
        <p className="text-center text-xs text-muted">
          Registers this device&apos;s passkey and signs you in. Dev: read the
          code from the API server console.
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
