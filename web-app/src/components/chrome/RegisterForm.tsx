"use client";

import { Mail } from "lucide-react";
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
        <ModalField label="Display name" placeholder="Jane" />
        <ModalField label="Handle" placeholder="@jane_alberta" />

        <SectionLabel>Your details — private (KYC)</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <ModalField label="First name" placeholder="Jane" />
          <ModalField label="Last name" placeholder="Doe" />
        </div>
        <ModalField label="Email" placeholder="jane@example.ca" />

        <SectionLabel>Address — sets your districts, never public</SectionLabel>
        <ModalField label="Street address" placeholder="123 Main St" />
        <ModalField label="Apt / unit (optional)" placeholder="Unit 4" />
        <div className="grid grid-cols-2 gap-2">
          <ModalField label="City" placeholder="Calgary" />
          <ModalField label="Province" placeholder="AB" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ModalField label="Postal code" placeholder="T2P 1A1" />
          <ModalField label="Country" placeholder="Canada (CA)" />
        </div>

        <label className="flex items-center gap-2 pt-1 text-sm text-ink">
          <input type="checkbox" defaultChecked className="size-4 rounded border-border" />
          I am 18 or older
          <span className="text-xs text-muted">— stored as a yes/no flag</span>
        </label>

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
