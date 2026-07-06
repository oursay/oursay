"use client";

import { useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { Button, Modal, ModalField } from "@/components/ui";

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
  const [over18, setOver18] = useState(true);

  const submit = () => {
    const h = handle.trim().replace(/^@/, "");
    const e = email.trim();
    if (!h || !e) return;
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
      subtitle="Verify email · add a passkey — no date of birth needed"
      mobileFull
    >
      <div className="space-y-3">
        <SectionLabel>Public profile</SectionLabel>
        <ModalField
          label="Handle"
          placeholder="@jane_alberta"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
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
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="flex items-center gap-2 pt-1 text-sm text-ink">
          <input
            type="checkbox"
            checked={over18}
            onChange={(e) => setOver18(e.target.checked)}
            className="size-4 rounded border-border"
          />
          I am 18 or older
          <span className="text-xs text-muted">— stored as a yes/no flag</span>
        </label>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted p-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-ink">
              No legal name or address needed to join
            </p>
            <p className="text-xs text-muted">
              You add those later, privately, only when you Get Verified — they
              set your districts and are never shown publicly.
            </p>
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

        <Button fullWidth icon={Mail} onClick={submit}>
          Send Verification Code
        </Button>
      </div>
    </Modal>
  );
}
