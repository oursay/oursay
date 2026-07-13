"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { isValidEmailFormat } from "@/lib/email";
import { handleValidationError, normalizeHandleBody } from "@/lib/handle";
import { Button, CheckboxIndicator, Modal, ModalField } from "@/components/ui";

export interface RegisterFormData {
  email: string;
  handle: string;
  displayName?: string;
  over18: boolean;
}

interface RegisterFormProps {
  open: boolean;
  onClose: () => void;
  /** Advances to the OTP step. Mock: no args; live: sends registration payload. */
  onSubmit?: (data?: RegisterFormData) => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="pt-1 text-[11px] font-bold uppercase tracking-wide text-muted">
      {children}
    </p>
  );
}

/** Registration form — mock advances with no payload; live sends email/handle/over18. */
export function RegisterForm({ open, onClose, onSubmit }: RegisterFormProps) {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  // Both attestations must be AFFIRMATIVE — never pre-checked (legal).
  const [over18, setOver18] = useState(false);
  const [privacyAck, setPrivacyAck] = useState(false);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const submit = () => {
    const err = handleValidationError(handle);
    if (err) {
      setHandleError(err);
      return;
    }
    setHandleError(null);
    const h = normalizeHandleBody(handle)!;
    const e = email.trim();
    if (!e || !isValidEmailFormat(e)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);

    onSubmit?.({
      email: e,
      handle: h,
      displayName: displayName.trim() || undefined,
      over18,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Create Account"
      subtitle="Verify email · add a passkey — no personal info needed"
      mobileFull
    >
      <div className="space-y-3">
        <SectionLabel>Public profile</SectionLabel>
        <ModalField
          label="Handle"
          placeholder="@jane_alberta"
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value);
            if (handleError) setHandleError(null);
          }}
        />
        {handleError ? (
          <p className="text-sm text-danger-700" role="alert">
            {handleError}
          </p>
        ) : null}
        <ModalField
          label="Display name (optional)"
          placeholder="Jane — defaults to your handle"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <ModalField
          label="Email"
          placeholder="jane@example.ca"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError(null);
          }}
        />
        {emailError ? (
          <p className="text-sm text-danger-700" role="alert">
            {emailError}
          </p>
        ) : null}

        <div className="space-y-0">
          <button
            type="button"
            role="checkbox"
            aria-checked={over18}
            onClick={() => setOver18((v) => !v)}
            className="flex min-h-5 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-surface-muted"
          >
            <CheckboxIndicator checked={over18} />
            <span
              className={`text-sm text-ink ${over18 ? "font-semibold" : "font-normal"}`}
            >
              I am 18 or older
            </span>
          </button>

          <div className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 hover:bg-surface-muted">
            <button
              type="button"
              role="checkbox"
              aria-checked={privacyAck}
              aria-label="I've read the Privacy Notice"
              onClick={() => setPrivacyAck((v) => !v)}
              className="inline-flex size-5 shrink-0 items-center justify-center"
            >
              <CheckboxIndicator checked={privacyAck} />
            </button>
            <div
              className={`min-w-0 flex-1 cursor-pointer text-sm text-ink ${
                privacyAck ? "font-semibold" : "font-normal"
              }`}
              onClick={() => setPrivacyAck((v) => !v)}
            >
              I&apos;ve read the{" "}
              <a
                href="/help/privacy"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
                onClick={(e) => e.stopPropagation()}
              >
                Privacy Notice (draft)
              </a>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted p-3">
          <Mail size={18} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-ink">
              We&apos;ll email you a 6-digit code
            </p>
            <p className="text-xs text-muted">
              Verify it on the next step, then add a passkey. In dev the API
              console prints the code.
            </p>
          </div>
        </div>

        <Button fullWidth icon={Mail} onClick={submit} disabled={!over18 || !privacyAck}>
          Send Verification Code
        </Button>
      </div>
    </Modal>
  );
}
