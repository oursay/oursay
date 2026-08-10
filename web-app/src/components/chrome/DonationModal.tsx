"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Heart, Loader2 } from "lucide-react";
import { Button, CheckboxIndicator, Modal } from "@/components/ui";
import {
  DONATION_SUGGESTED_AMOUNTS,
  donationProviderConfigured,
  getDonationModalProvider,
  getEtransferEmail,
  openGitHubSponsors,
  type DonationModalProvider,
  type DonationSuggestedAmount,
} from "@/lib/donations";

export type DonationModalVariant = "public" | "kyc";

interface DonationModalProps {
  open: boolean;
  onClose: () => void;
  variant: DonationModalVariant;
  /**
   * KYC soft-ask: continue to free verification without donating.
   * Public variant: same as dismiss.
   */
  onContinue?: () => void;
  /** Optional busy state while parent starts KYC after continue. */
  busy?: boolean;
  /** Toast callback after copying the e-Transfer email. */
  onNotify?: (message: string) => void;
}

function channelLabel(provider: DonationModalProvider): string {
  return provider === "etransfer" ? "Interac e-Transfer" : "GitHub Sponsors";
}

function modalCopy(
  variant: DonationModalVariant,
  provider: DonationModalProvider,
): { title: string; body: ReactNode } {
  const channel = channelLabel(provider);
  if (variant === "public") {
    return {
      title: "Keep verification free",
      body: (
        <>
          <strong className="font-semibold text-ink">OurSay will not charge you</strong> 
          {" "}for identity checks.{" "}
          <strong className="font-semibold text-ink">Optional donations</strong>
          {provider === "github" ? " — including recurring — " : " "}
          through {channel}{" "}
          <strong className="font-semibold text-ink">
            keep verification free and keeps OurSay running and improving
          </strong>{" "}by covering server and development costs without ads or paywalls. Highly encouraged. Never required.
        </>
      ),
    };
  }
  return {
    title: "Pay it Forward",
    body: (
      <>
        Doing ID verification carries a small cost. Even a minimal donation of{" "}
        <strong className="font-semibold text-ink">
          $1 pays for 1 verification and 1 account recovery
        </strong>
        . Because someone donated before you,{" "}
        <strong className="font-semibold text-ink">
          this verification is free of charge
        </strong>
        . So before you claim your free account verification,{" "}
        <strong className="font-semibold text-ink">
          {provider === "github"
            ? "consider a one-time or recurring gift"
            : "consider a small gift"}
        </strong>{" "}
        via {channel} so the next Albertan can verify without a paywall.
      </>
    ),
  };
}

const DEFAULT_AMOUNT: DonationSuggestedAmount = 5;

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Soft-ask for donations. Provider is NEXT_PUBLIC_DONATION_MODAL_PROVIDER
 * (`github` | `etransfer`). Enable via NEXT_PUBLIC_SHOW_DONATION_MODAL_PUBLIC / _KYC.
 */
export function DonationModal({
  open,
  onClose,
  variant,
  onContinue,
  busy = false,
  onNotify,
}: DonationModalProps) {
  const provider = getDonationModalProvider();
  const copy = modalCopy(variant, provider);
  const canDonate = donationProviderConfigured();
  const etransferEmail = getEtransferEmail();
  const [amount, setAmount] = useState<DonationSuggestedAmount>(DEFAULT_AMOUNT);
  const [recurring, setRecurring] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(DEFAULT_AMOUNT);
    setRecurring(false);
    setEmailCopied(false);
  }, [open]);

  const finish = () => {
    if (busy) return;
    if (onContinue) onContinue();
    else onClose();
  };

  const copyEmail = async () => {
    if (!etransferEmail || busy) return;
    const ok = await copyToClipboard(etransferEmail);
    if (ok) {
      setEmailCopied(true);
      onNotify?.("Email copied");
      window.setTimeout(() => setEmailCopied(false), 2000);
    } else {
      onNotify?.("Could not copy — select the email and copy manually");
    }
  };

  const missingConfigHint =
    provider === "etransfer"
      ? "E-Transfer email is not configured in this environment."
      : "Sponsors URL is not configured in this environment.";

  const skipLabel =
    variant === "kyc" ? "Proceed to verification" : "I'll donate next time";

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={copy.title}
      headerAlign="center"
      size="dialog"
    >
      <div className="space-y-4">
        <p className="text-center text-sm text-muted">{copy.body}</p>

        {provider === "github" ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Amount (CAD)
            </p>
            <div
              role="radiogroup"
              aria-label="Donation amount"
              className="grid grid-cols-4 gap-2"
            >
              {DONATION_SUGGESTED_AMOUNTS.map((value) => {
                const selected = amount === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={busy}
                    onClick={() => setAmount(value)}
                    className={`inline-flex min-h-11 items-center justify-center rounded-lg border text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-border-strong bg-surface text-ink hover:bg-surface-muted"
                    }`}
                  >
                    ${value}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              role="checkbox"
              aria-checked={recurring}
              disabled={busy}
              onClick={() => setRecurring((v) => !v)}
              className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-2 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckboxIndicator checked={recurring} />
              <span
                className={`text-sm text-ink ${recurring ? "font-semibold" : "font-normal"}`}
              >
                + Recurring Monthly
              </span>
            </button>
          </div>
        ) : null}

        {busy ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-3 text-sm text-muted">
            <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
            Continuing…
          </div>
        ) : provider === "etransfer" ? (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1.5 pl-5 text-left text-sm text-muted">
              <li>Open your banking app or online banking.</li>
              <li>
                Start an Interac e-Transfer to the email below for any amount under $100.
              </li>
              <li>Autodeposit if offered — no security question needed.</li>
            </ol>

            <div>
              <p className="mb-1.5 text-center text-xs font-medium uppercase tracking-wide text-muted">
                Send to
              </p>
              <div className="relative">
                <input
                  type="email"
                  readOnly
                  value={etransferEmail ?? ""}
                  placeholder="Set NEXT_PUBLIC_ETRANSFER_EMAIL"
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-lg border border-border bg-surface-muted py-2.5 pl-11 pr-11 text-center font-mono text-sm text-ink focus:border-brand-400 focus:outline-none"
                  aria-label="Interac e-Transfer email"
                />
                <button
                  type="button"
                  disabled={!canDonate || busy}
                  onClick={() => void copyEmail()}
                  title={
                    canDonate
                      ? "Copy e-Transfer email"
                      : "Set NEXT_PUBLIC_ETRANSFER_EMAIL to enable"
                  }
                  aria-label={emailCopied ? "Email copied" : "Copy email"}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {emailCopied ? (
                    <Check size={16} aria-hidden />
                  ) : (
                    <Copy size={16} aria-hidden />
                  )}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={finish}
              className="block w-full pt-1 text-center text-sm text-muted underline underline-offset-2 hover:text-ink-soft"
            >
              {skipLabel}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              fullWidth
              icon={Heart}
              disabled={!canDonate}
              onClick={() => openGitHubSponsors({ amount, recurring })}
              title={
                canDonate
                  ? "Open GitHub Sponsors with your selection"
                  : "Set NEXT_PUBLIC_GITHUB_SPONSORS_URL to enable"
              }
            >
              Donate on GitHub Sponsors
            </Button>
            <Button
              fullWidth
              variant="outline"
              disabled={!canDonate}
              onClick={() => openGitHubSponsors({ amount: "custom", recurring })}
              title={
                canDonate
                  ? "Choose a custom amount on GitHub Sponsors"
                  : "Set NEXT_PUBLIC_GITHUB_SPONSORS_URL to enable"
              }
            >
              Set a Custom Amount
            </Button>
            <button
              type="button"
              onClick={finish}
              className="block w-full pt-1 text-center text-sm text-muted underline underline-offset-2 hover:text-ink-soft"
            >
              {skipLabel}
            </button>
          </div>
        )}

        {!canDonate ? (
          <p className="text-xs text-muted">{missingConfigHint}</p>
        ) : null}
      </div>
    </Modal>
  );
}
