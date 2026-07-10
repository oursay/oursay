"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, IdCard, Mail, ShieldCheck } from "lucide-react";
import { isValidEmailFormat } from "@/lib/email";
import { handleValidationError, normalizeHandleBody } from "@/lib/handle";
import { Button, Modal, ModalField } from "@/components/ui";

export interface RegisterVerificationAddress {
  line1?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
}

export interface RegisterFormData {
  email: string;
  handle: string;
  displayName?: string;
  over18: boolean;
  firstName?: string;
  lastName?: string;
  address?: RegisterVerificationAddress;
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
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [country, setCountry] = useState("CA");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
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

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const addressFields = {
      line1: line1.trim(),
      city: city.trim(),
      province: province.trim(),
      postalCode: postalCode.trim(),
    };
    const hasAddress = Object.values(addressFields).some((v) => v.length > 0);

    onSubmit?.({
      email: e,
      handle: h,
      displayName: displayName.trim() || undefined,
      over18,
      ...(trimmedFirst ? { firstName: trimmedFirst } : {}),
      ...(trimmedLast ? { lastName: trimmedLast } : {}),
      ...(hasAddress
        ? { address: { ...addressFields, country: country.trim() || "CA" } }
        : {}),
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

        <label className="flex items-center gap-2 pt-1 text-sm text-ink">
          <input
            type="checkbox"
            checked={over18}
            onChange={(e) => setOver18(e.target.checked)}
            className="size-4 rounded border-border"
          />
          I am 18 or older
        </label>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={privacyAck}
            onChange={(e) => setPrivacyAck(e.target.checked)}
            className="size-4 rounded border-border"
          />
          <span>
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
          </span>
        </label>

        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                You have the right to join anonymously
              </p>
              <p className="text-xs text-muted">
                A handle is enough to participate. Getting verified unlocks more
                access and visibility — home-district posts, residency voting, and
                a verification badge on your contributions.
              </p>
              <p className="mt-2 text-xs text-muted">
                Legal name and address stay private — they set your home districts
                and are never shown on the public record.
              </p>
              <button
                type="button"
                onClick={() => setVerificationOpen((o) => !o)}
                aria-expanded={verificationOpen}
                className="mt-2 flex min-h-9 w-full items-center gap-2 text-left text-xs font-semibold text-ink hover:text-ink-soft"
              >
                <IdCard size={16} className="shrink-0 text-ink" aria-hidden />
                <span className="flex-1">Add verification details now (optional)</span>
                {verificationOpen ? (
                  <ChevronDown size={16} className="shrink-0 text-ink-soft" aria-hidden />
                ) : (
                  <ChevronRight size={16} className="shrink-0 text-ink-soft" aria-hidden />
                )}
              </button>
            </div>
          </div>
          {verificationOpen ? (
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              <div className="grid grid-cols-2 gap-2">
                <ModalField
                  label="Legal first name"
                  placeholder="Jane"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
                <ModalField
                  label="Legal last name"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <ModalField
                label="Country"
                placeholder="CA"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
              <ModalField
                label="Street address"
                placeholder="123 Main St"
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
              />
              <ModalField
                label="City"
                placeholder="Edmonton"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <ModalField
                  label="Province"
                  placeholder="AB"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                />
                <ModalField
                  label="Postal code"
                  placeholder="T5K 0A1"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                />
              </div>
            </div>
          ) : null}
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
