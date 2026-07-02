"use client";

import {
  ChevronRight,
  Eye,
  Gavel,
  Globe,
  IdCard,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Pencil,
  Plus,
  ShieldCheck,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar, Button, Modal } from "@/components/ui";
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
  /** Registers a passkey on this device. */
  onAddDevice?: () => void;
  /** Opens the OTP window so a new device can log in by email. */
  onAddDeviceByEmail?: () => void;
  /** Deferred account-settings destinations (wireframe no-ops → toast). */
  onOpenSetting?: (label: string) => void;
}

/** Wireframe KYC_TIERS — the account's own ladder, not the author pill labels. */
const KYC_LABEL: Record<VerificationTier, string> = {
  0: "Unverified",
  1: "Identity Verified",
  2: "Residency Verified",
  3: "Official",
};

const KYC_ICON: Record<VerificationTier, LucideIcon> = {
  0: ShieldCheck,
  1: IdCard,
  2: MapPin,
  3: Gavel,
};

/** Only the first two devices are listed; the rest collapse to "+N more". */
const DEVICES_SHOWN = 2;

function SettingsRow({
  icon: Icon,
  label,
  trailing,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  trailing?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-ink hover:bg-surface-muted"
    >
      <Icon size={16} className="shrink-0 text-ink-soft" aria-hidden />
      {label}
      <span className="ml-auto flex items-center gap-1 text-xs text-muted capitalize">
        {trailing}
        <ChevronRight size={14} aria-hidden />
      </span>
    </button>
  );
}

/**
 * Logged-in account modal (private; ≠ the public Profile view). Wireframe
 * sections: identity verification (KYC badge + Validate ID), devices &
 * passkeys, account settings, logout, legal footer.
 */
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
  onAddDevice,
  onAddDeviceByEmail,
  onOpenSetting,
}: ProfileModalProps) {
  const KycIcon = KYC_ICON[kycTier];
  const hidden = devices.length - DEVICES_SHOWN;

  return (
    <Modal open={open} onClose={onClose} variant="sheet" title="Profile" mobileFull>
      <div className="space-y-5">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <Avatar name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{name}</p>
            <p className="truncate text-sm text-muted">
              @{handle} · private to you
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">
            Identity verification
          </p>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex min-h-10 flex-1 items-center gap-2 rounded-full px-4 text-sm font-medium ${
                kycTier > 0
                  ? "bg-ink text-white"
                  : "border border-border bg-surface-muted text-muted"
              }`}
            >
              <KycIcon size={15} aria-hidden />
              {KYC_LABEL[kycTier]}
            </span>
            <Button className="rounded-full" onClick={onValidateId}>
              Validate ID
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Alt: KYC tier — at-cost, no PII on the public record
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">
            Devices &amp; passkeys ({devices.length})
          </p>
          <ul className="space-y-1.5">
            {devices.slice(0, DEVICES_SHOWN).map((d) => (
              <li
                key={d}
                className="flex min-h-9 items-center gap-2 text-sm text-ink-soft"
              >
                <KeyRound size={15} className="shrink-0" aria-hidden />
                {d}
              </li>
            ))}
            {hidden > 0 ? (
              <li className="pl-6 text-sm text-muted">+{hidden} more</li>
            ) : null}
          </ul>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" icon={Plus} onClick={onAddDevice}>
              Add Device
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Mail}
              onClick={onAddDeviceByEmail}
            >
              Add by Email
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Alt: Add Device = passkey on this device · by Email = OTP to a new
            one
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Account settings</p>
          <div className="space-y-1.5">
            <SettingsRow
              icon={Pencil}
              label="Edit Profile"
              onClick={() => onOpenSetting?.("Edit Profile")}
            />
            <SettingsRow
              icon={MapPin}
              label="Change Address"
              onClick={() => onOpenSetting?.("Change Address")}
            />
            <SettingsRow
              icon={Eye}
              label="Privacy Settings"
              onClick={() => onOpenSetting?.("Privacy Settings")}
            />
            <SettingsRow
              icon={Globe}
              label="Jurisdictions"
              onClick={() => onOpenSetting?.("Jurisdictions")}
            />
            <SettingsRow
              icon={theme === "dark" ? Moon : Sun}
              label="Theme"
              trailing={theme}
              onClick={onToggleTheme}
            />
          </div>
        </div>

        <Button
          fullWidth
          variant="outline"
          icon={LogOut}
          onClick={onLogout}
          className="border-danger-200 text-danger-600 hover:bg-danger-50"
        >
          Log out
        </Button>

        <div className="space-y-1 pb-1 text-center">
          <p className="space-x-4 text-xs text-ink-soft">
            <button
              type="button"
              className="underline underline-offset-2 hover:text-ink"
              onClick={() => onOpenSetting?.("Terms of Service")}
            >
              Terms of Service
            </button>
            <button
              type="button"
              className="underline underline-offset-2 hover:text-ink"
              onClick={() => onOpenSetting?.("Privacy Policy")}
            >
              Privacy Policy
            </button>
          </p>
          <p className="text-xs text-muted">
            © 2026 OurSay · all rights reserved
          </p>
        </div>
      </div>
    </Modal>
  );
}
