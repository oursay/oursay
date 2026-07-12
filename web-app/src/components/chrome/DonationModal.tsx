"use client";

import { Heart, Loader2 } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import {
  DONATION_SUGGESTED_AMOUNTS,
  getSponsorsUrl,
  openGitHubSponsors,
} from "@/lib/donations";

export type DonationModalVariant = "public" | "kyc";

interface DonationModalProps {
  open: boolean;
  onClose: () => void;
  variant: DonationModalVariant;
  /**
   * KYC soft-ask: continue to free verification without donating.
   * Public variant: same as dismiss ("Maybe later").
   */
  onContinue?: () => void;
  /** Optional busy state while parent starts KYC after continue. */
  busy?: boolean;
}

const COPY: Record<
  DonationModalVariant,
  { title: string; body: string; continueLabel: string }
> = {
  public: {
    title: "Keep verification free",
    body:
      "OurSay does not charge for identity checks. Optional donations — including recurring — through GitHub Sponsors fund the next citizen’s free verification. Highly encouraged. Never required.",
    continueLabel: "Maybe later",
  },
  kyc: {
    title: "Fund the next free verify",
    body:
      "Verification stays free for you. Before we open the secure check, please consider a one-time or recurring gift via GitHub Sponsors so the next Albertan can verify without a paywall.",
    continueLabel: "Continue without donating",
  },
};

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
        <p className="text-sm text-muted">{copy.body}</p>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Suggested (CAD)
          </p>
          <div className="flex flex-wrap gap-2">
            {DONATION_SUGGESTED_AMOUNTS.map((amount) => (
              <span
                key={amount}
                className="inline-flex min-h-9 items-center rounded-lg border border-border bg-surface-muted px-3 text-sm font-medium text-ink-soft"
              >
                ${amount}
              </span>
            ))}
            <span className="inline-flex min-h-9 items-center text-xs text-muted">
              + recurring
            </span>
          </div>
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
              onClick={() => {
                openGitHubSponsors();
              }}
              title={
                canDonate
                  ? "Open GitHub Sponsors"
                  : "Set NEXT_PUBLIC_GITHUB_SPONSORS_URL to enable"
              }
            >
              Donate on GitHub Sponsors
            </Button>
            <Button fullWidth variant="outline" onClick={finish}>
              {copy.continueLabel}
            </Button>
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
