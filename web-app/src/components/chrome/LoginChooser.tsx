"use client";

import { useEffect, useState } from "react";
import { Key, Mail, MailCheck } from "lucide-react";
import { Button, CollapsibleSection, Modal, ModalField } from "@/components/ui";

interface LoginChooserProps {
  open: boolean;
  onClose: () => void;
  /** OTP-login window: off = passkey only; on = email login gate available. */
  otpWindow?: boolean;
  /** Email prefill (e.g. from `?otpEmail=` deep-link). */
  email?: string;
  onPasskeyLogin?: () => void;
  onVerifyEmail?: (email: string) => void;
  onRecover?: () => void;
}

/** Returning-user login (the wireframe's loginModal / buildLoginInner). */
export function LoginChooser({
  open,
  onClose,
  otpWindow = false,
  email,
  onPasskeyLogin,
  onVerifyEmail,
  onRecover,
}: LoginChooserProps) {
  const [emailOpen, setEmailOpen] = useState(Boolean(otpWindow));
  const [draftEmail, setDraftEmail] = useState(email ?? "");

  useEffect(() => {
    setDraftEmail(email ?? "");
    // Deep-links (or debug toggles) open the section so the user sees the email input.
    setEmailOpen(Boolean(otpWindow || (email?.trim()?.length ?? 0) > 0));
  }, [otpWindow, email]);

  return (
    <Modal open={open} onClose={onClose} title="Log In" headerAlign="center">
      <div className="space-y-3">
        <p className="text-center text-sm text-muted">Use your passkey to sign in</p>
        <Button variant="primary" fullWidth icon={Key} onClick={onPasskeyLogin}>
          Log In With Passkey
        </Button>

        <CollapsibleSection
          icon={Mail}
          label="Trying to login using email?"
          open={emailOpen}
          onToggle={() => setEmailOpen((v) => !v)}
          contentClassName="px-1 pt-1"
        >
          <div className="space-y-2">
            <p className="text-[10px] text-muted text-center leading-snug">
              Authorize email login from an existing device/passkey. Profile: &quot;Devices &amp; Passkeys&quot;
              -&gt; &quot;+ Add by Email&quot; enables email login for 30 minutes.
            </p>
            <ModalField
              label="Email"
              placeholder="jane@example.ca"
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
            />
            <Button
              fullWidth
              variant="outline"
              icon={MailCheck}
              onClick={() => onVerifyEmail?.(draftEmail.trim())}
              disabled={draftEmail.trim().length === 0}
            >
              Verify Email
            </Button>
          </div>
        </CollapsibleSection>

        <button
          type="button"
          onClick={onRecover}
          className="block w-full text-center text-sm text-ink-soft underline underline-offset-2"
        >
          Lost or inaccessible device/passkey? Recover your account.
        </button>
      </div>
    </Modal>
  );
}
