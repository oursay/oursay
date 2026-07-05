"use client";

import { KeyRound, Mail } from "lucide-react";
import { Button, Modal, ModalField } from "@/components/ui";

interface LoginChooserProps {
  open: boolean;
  onClose: () => void;
  /** OTP-login window: off = passkey only; on = email-OTP or passkey. */
  otpWindow?: boolean;
  onPasskeyLogin?: () => void;
  onVerifyEmail?: () => void;
  onRecover?: () => void;
}

/** Returning-user login (the wireframe's loginModal / buildLoginInner). */
export function LoginChooser({
  open,
  onClose,
  otpWindow = false,
  onPasskeyLogin,
  onVerifyEmail,
  onRecover,
}: LoginChooserProps) {
  return (
    <Modal open={open} onClose={onClose} title="Log In" headerAlign="center">
      <div className="space-y-3">
        {otpWindow ? (
          <>
            <ModalField label="Email" placeholder="jane@example.ca" />
            <Button fullWidth icon={Mail} onClick={onVerifyEmail}>
              Verify Email
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              fullWidth
              variant="outline"
              icon={KeyRound}
              onClick={onPasskeyLogin}
            >
              Log In With Passkey
            </Button>
          </>
        ) : (
          <>
            <p className="text-center text-sm text-muted">
              Use your passkey to sign in
            </p>
            <Button fullWidth icon={KeyRound} onClick={onPasskeyLogin}>
              Log In With Passkey
            </Button>
          </>
        )}
        <button
          type="button"
          onClick={onRecover}
          className="block w-full text-center text-sm text-ink-soft underline underline-offset-2"
        >
          Lost your passkey? Recover account
        </button>
      </div>
    </Modal>
  );
}
