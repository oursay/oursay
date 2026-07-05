"use client";

import { Mail, ShieldCheck } from "lucide-react";
import { Button, Modal, ModalField } from "@/components/ui";

interface RegisterFormProps {
  open: boolean;
  onClose: () => void;
  /** Advances to the OTP step (no real submission). */
  onSubmit?: () => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="pt-1 text-[11px] font-bold uppercase tracking-wide text-muted">
      {children}
    </p>
  );
}

/** Near-full-screen registration form (presentational only — no submit logic). */
export function RegisterForm({ open, onClose, onSubmit }: RegisterFormProps) {
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
        <ModalField label="Handle" placeholder="@jane_alberta" />
        <ModalField
          label="Display name (optional)"
          placeholder="Jane — defaults to your handle"
        />
        <ModalField label="Email" placeholder="jane@example.ca" />

        <label className="flex items-center gap-2 pt-1 text-sm text-ink">
          <input type="checkbox" defaultChecked className="size-4 rounded border-border" />
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
              Verify it on the next step, then add a passkey
            </p>
          </div>
        </div>

        <Button fullWidth icon={Mail} onClick={onSubmit}>
          Send Verification Code
        </Button>
      </div>
    </Modal>
  );
}
