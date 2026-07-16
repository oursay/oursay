"use client";

import { useState } from "react";
import { Key } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import type { PasskeyBusyPhase } from "@/lib/state/passkeyBusy";

interface OtpVerifyProps {
  open: boolean;
  onClose: () => void;
  email?: string;
  mode?: "registration" | "login" | "recovery";
  /** Registers this device's passkey and signs in. */
  onRegisterPasskey?: (code: string) => void;
  onResend?: () => void;
  passkeyBusy?: PasskeyBusyPhase | null;
}

/** OTP entry + passkey registration/re-enrollment step. */
export function OtpVerify({
  open,
  onClose,
  email = "jane@example.ca",
  mode = "registration",
  onRegisterPasskey,
  onResend,
  passkeyBusy = null,
}: OtpVerifyProps) {
  const [code, setCode] = useState("");

  let helperText =
    mode === "recovery"
      ? "Re-enrolls this device's passkey, then you'll be prompted to sign in."
      : "Creates a passkey on this device, then signs you in with it.";

  if (process.env.NODE_ENV === "development") helperText += " Dev: read the code from the API server console."

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Verify Your Email"
      subtitle={`Enter the 6-digit code sent to ${email}`}
      headerAlign="center"
      passkeyBusy={passkeyBusy}
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
          icon={Key}
          onClick={() => onRegisterPasskey?.(code)}
          disabled={code.length < 6}
        >
          Register Passkey
        </Button>
        <p className="text-center text-xs text-muted">
          {helperText}
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
