"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Heart, Loader2 } from "lucide-react";
import { Button, CheckboxIndicator, Modal } from "@/components/ui";
import {
  DONATION_SUGGESTED_AMOUNTS,
  getSponsorsUrl,
  openGitHubSponsors,
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
}

const COPY: Record<DonationModalVariant, { title: string; body: ReactNode }> = {
  public: {
    title: "Keep verification free",
    body: (
      <>
        <strong className="font-semibold text-ink">OurSay does not charge</strong> for
        identity checks.{" "}
        <strong className="font-semibold text-ink">Optional donations</strong> — including recurring — through GitHub
        Sponsors{" "}
        <strong className="font-semibold text-ink">
          fund the next citizen&apos;s free verification
        </strong>
        . Highly encouraged. Never required.
      </>
    ),
  },
  kyc: {
    title: "Pay it Forward",
    body: (
      <>
        Doing ID verification carries a small charge.{" "}
        <strong className="font-semibold text-ink">
          $1 pays for 1 verification and 1 account recovery
        </strong>
        . Because someone donated,{" "}
        <strong className="font-semibold text-ink">
          this verification is free of charge
        </strong>
        . So before you claim your free account verification,{" "}
        <strong className="font-semibold text-ink">
          consider a one-time or recurring gift
        </strong>{" "}
        via GitHub Sponsors so the next Albertan can verify without a paywall.
      </>
    ),
  },
};

const DEFAULT_AMOUNT: DonationSuggestedAmount = 5;

/**
 * Soft-ask for GitHub Sponsors. Public visitors and pre-KYC paths share one shell;
 * enable via NEXT_PUBLIC_SHOW_DONATION_MODAL_PUBLIC / _KYC.
 */
export function DonationModal({
  open,
  onClose,
  variant,
  onContinue,
  busy = false,
}: DonationModalProps) {
  const copy = COPY[variant];
  const sponsorsUrl = getSponsorsUrl();
  const canDonate = Boolean(sponsorsUrl);
  const [amount, setAmount] = useState<DonationSuggestedAmount>(DEFAULT_AMOUNT);
  const [recurring, setRecurring] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(DEFAULT_AMOUNT);
    setRecurring(false);
  }, [open]);

  const finish = () => {
    if (busy) return;
    if (onContinue) onContinue();
    else onClose();
  };

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

        {busy ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-3 text-sm text-muted">
            <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
            Continuing…
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
              I&apos;ll donate next time
            </button>
          </div>
        )}

        {!canDonate ? (
          <p className="text-xs text-muted">
            Sponsors URL is not configured in this environment.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
