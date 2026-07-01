"use client";

import { KeyRound, LogOut, Moon, Smartphone, Sun } from "lucide-react";
import { Avatar, Button, Modal } from "@/components/ui";
import { VerificationPill } from "@/components/identity";
import type { VerificationTier } from "@/lib/types";

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  name: string;
  handle: string;
  kycTier: VerificationTier;
  /** Cycles the KYC tier in the wireframe (dev affordance). */
  onValidateId?: () => void;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onLogout?: () => void;
  /** Registered device / passkey labels. */
  devices?: string[];
}

/** Logged-in account modal: KYC badge, Validate ID, devices, theme, logout. */
export function ProfileModal({
  open,
  onClose,
  name,
  handle,
  kycTier,
  onValidateId,
  theme = "light",
  onToggleTheme,
  onLogout,
  devices = ["This device (passkey)"],
}: ProfileModalProps) {
  return (
    <Modal open={open} onClose={onClose} variant="sheet" title="Profile">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{name}</p>
            <p className="truncate text-sm text-muted">@{handle}</p>
          </div>
          <div className="ml-auto">
            <VerificationPill tier={kycTier} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Identity</p>
              <p className="text-xs text-muted">Raise your verification tier</p>
            </div>
            <Button variant="outline" size="sm" onClick={onValidateId}>
              Validate ID
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
            Devices &amp; passkeys
          </p>
          <ul className="space-y-1">
            {devices.map((d) => (
              <li
                key={d}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-ink-soft"
              >
                <Smartphone size={15} aria-hidden />
                {d}
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" icon={KeyRound} className="mt-1">
            Add Device
          </Button>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border px-3 text-sm text-ink"
        >
          {theme === "dark" ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
          Theme
          <span className="ml-auto text-xs text-muted capitalize">{theme}</span>
        </button>

        <Button
          fullWidth
          variant="outline"
          icon={LogOut}
          onClick={onLogout}
        >
          Log out
        </Button>
      </div>
    </Modal>
  );
}
