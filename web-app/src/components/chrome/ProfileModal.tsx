"use client";

import { useState } from "react";
import {
  ChevronRight,
  Eye,
  Gavel,
  Globe,
  IdCard,
  Key,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Pencil,
  PenTool,
  Plus,
  ShieldCheck,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar, Button, Modal } from "@/components/ui";
import { VisibilityPicker } from "@/components/identity";
import type {
  AuthorVisibility,
  SignAction,
  SignMethod,
  SigningPrefs,
  VerificationTier,
} from "@/lib/types";
import {
  POST_SUB_ACTIONS,
  SIGN_METHOD_LABEL,
  SIGN_METHODS,
  VISIBILITY_LABEL,
} from "@/lib/types";

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  name: string;
  handle: string;
  kycTier: VerificationTier;
  /** Account-default profile visibility (docs/09 cascade base). */
  accountVisibility?: AuthorVisibility;
  onChangeVisibility?: (v: AuthorVisibility) => void;
  /** Opens the account's own public profile (/profile/self). */
  onViewProfile?: () => void;
  /** Cycles the KYC tier in the wireframe (dev affordance). */
  onValidateId?: () => void;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  /** Per-action signing methods; when omitted the Signing Options row is hidden. */
  signing?: SigningPrefs;
  onSetSigning?: (action: SignAction, method: SignMethod) => void;
  onSetPostSigning?: (method: SignMethod) => void;
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

/** Latest per-tier verification colours (mirrors VerificationPill's TIER_BG). */
const KYC_TIER_BG: Record<Exclude<VerificationTier, 0>, string> = {
  1: "bg-verify-tier-1", // Identity — green
  2: "bg-verify-tier-2", // Residency — blue
  3: "bg-verify-tier-3", // Official — black
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

/** Ask · Quick · Passkey segmented control for one signing action. */
function SigningMethodRow({
  label,
  value,
  onChange,
  sub = false,
}: {
  label: string;
  /** null = "mixed" (the Post parent when sub-actions differ) — no active tab. */
  value: SignMethod | null;
  onChange: (method: SignMethod) => void;
  sub?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${sub ? "pl-3" : ""}`}>
      <span
        className={`truncate text-sm ${sub ? "text-ink-soft" : "font-medium text-ink"}`}
      >
        {label}
      </span>
      <div className="ml-auto inline-flex shrink-0 rounded-full border border-border bg-surface p-0.5">
        {SIGN_METHODS.map((method) => {
          const active = value === method;
          return (
            <button
              key={method}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(method)}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                active
                  ? "bg-brand-600 text-white"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {SIGN_METHOD_LABEL[method]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Per-action signing preferences; Post is a multi-switch for its sub-actions. */
function SigningOptionsPanel({
  signing,
  onSetSigning,
  onSetPostSigning,
}: {
  signing: SigningPrefs;
  onSetSigning: (action: SignAction, method: SignMethod) => void;
  onSetPostSigning: (method: SignMethod) => void;
}) {
  const postMethods = POST_SUB_ACTIONS.map((a) => signing[a]);
  const postCommon = postMethods.every((m) => m === postMethods[0])
    ? postMethods[0]
    : null;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-muted p-2">
      <p className="px-1 text-xs text-muted">
        How each action is signed. A jurisdiction may require a stronger method —
        e.g. Alberta always requires a passkey.
      </p>
      <SigningMethodRow label="Post" value={postCommon} onChange={onSetPostSigning} />
      <div className="space-y-1.5 border-l border-border pl-1.5">
        <SigningMethodRow
          label="Statement"
          value={signing["post.statement"]}
          onChange={(m) => onSetSigning("post.statement", m)}
          sub
        />
        <SigningMethodRow
          label="Petition"
          value={signing["post.petition"]}
          onChange={(m) => onSetSigning("post.petition", m)}
          sub
        />
        <SigningMethodRow
          label="Poll"
          value={signing["post.poll"]}
          onChange={(m) => onSetSigning("post.poll", m)}
          sub
        />
      </div>
      <SigningMethodRow
        label="Signature"
        value={signing.signature}
        onChange={(m) => onSetSigning("signature", m)}
      />
      <SigningMethodRow
        label="Vote"
        value={signing.vote}
        onChange={(m) => onSetSigning("vote", m)}
      />
      <SigningMethodRow
        label="Comment"
        value={signing.comment}
        onChange={(m) => onSetSigning("comment", m)}
      />
      <SigningMethodRow
        label="Reaction"
        value={signing.reaction}
        onChange={(m) => onSetSigning("reaction", m)}
      />
    </div>
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
  accountVisibility = "anonymous",
  onChangeVisibility,
  onViewProfile,
  onValidateId,
  theme = "light",
  onToggleTheme,
  signing,
  onSetSigning,
  onSetPostSigning,
  onLogout,
  devices = ["This device (passkey)"],
  onAddDevice,
  onAddDeviceByEmail,
  onOpenSetting,
}: ProfileModalProps) {
  const KycIcon = KYC_ICON[kycTier];
  const [devicesExpanded, setDevicesExpanded] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [signingOpen, setSigningOpen] = useState(false);
  const hidden = devices.length - DEVICES_SHOWN;
  const shownDevices = devicesExpanded ? devices : devices.slice(0, DEVICES_SHOWN);

  return (
    <Modal open={open} onClose={onClose} variant="sheet" title="Profile" mobileFull>
      <div className="space-y-5">
        <div className="border-b border-border pb-4">
          <button
            type="button"
            aria-label="View public profile"
            onClick={onViewProfile}
            className="flex w-full items-center gap-3 rounded-lg p-1 text-left hover:bg-surface-muted"
          >
            <Avatar name={name} seed={handle} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{name}</p>
              <p className="truncate text-sm text-muted">@{handle}</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
          </button>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">
            Identity Verification
          </p>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex min-h-9 flex-1 items-center gap-2 rounded-full px-4 text-sm font-medium ${
                kycTier > 0
                  ? `${KYC_TIER_BG[kycTier as Exclude<VerificationTier, 0>]} ${
                      kycTier === 3 ? "text-paper" : "text-white"
                    }`
                  : "bg-ink-soft text-paper"
              }`}
            >
              <KycIcon size={15} aria-hidden />
              {KYC_LABEL[kycTier]}
            </span>
            <Button size="sm" className="rounded-full!" onClick={onValidateId}>
              Validate ID
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            KYC tier — no PII on the public record
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">
            Devices &amp; Passkeys ({devices.length})
          </p>
          <ul className="space-y-1.5">
            {shownDevices.map((d) => (
              <li
                key={d}
                className="flex min-h-9 items-center gap-2 text-sm text-ink-soft"
              >
                <Key size={15} className="shrink-0" aria-hidden />
                {d}
              </li>
            ))}
            {hidden > 0 ? (
              <li>
                <button
                  type="button"
                  onClick={() => setDevicesExpanded((v) => !v)}
                  aria-expanded={devicesExpanded}
                  className="pl-6 text-sm text-muted underline underline-offset-2 hover:text-ink"
                >
                  {devicesExpanded ? "Show less" : `+${hidden} more`}
                </button>
              </li>
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
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Account Settings</p>
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
              trailing={VISIBILITY_LABEL[accountVisibility]}
              onClick={() => setPrivacyOpen((v) => !v)}
            />
            {privacyOpen ? (
              <div className="space-y-1.5 rounded-lg border border-border bg-surface-muted p-2">
                <p className="px-1 text-xs text-muted">
                  Who can see your profile behind your posts. Everyone else sees
                  a per-thread persona.
                </p>
                <VisibilityPicker
                  value={accountVisibility}
                  onChange={(v) => onChangeVisibility?.(v)}
                />
              </div>
            ) : null}
            {signing && onSetSigning && onSetPostSigning ? (
              <>
                <SettingsRow
                  icon={PenTool}
                  label="Signing Options"
                  onClick={() => setSigningOpen((v) => !v)}
                />
                {signingOpen ? (
                  <SigningOptionsPanel
                    signing={signing}
                    onSetSigning={onSetSigning}
                    onSetPostSigning={onSetPostSigning}
                  />
                ) : null}
              </>
            ) : null}
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
