"use client";

import { useEffect, useRef, useState } from "react";
import { displayHandle } from "@/lib/handle";
import {
  ChevronRight,
  Eye,
  Globe,
  Heart,
  IdCard,
  Key,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Pencil,
  PenTool,
  Plus,
  BadgeCheck,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar, Button, Modal } from "@/components/ui";
import {
  entityMarkBackground,
  entityMarkForeground,
  type EntityMarkSpec,
  VisibilityPicker,
} from "@/components/identity";
import type { AuthPasskey } from "@/lib/api/auth";
import { passkeyDisplayLabel } from "@/lib/api/auth";
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
import type { PasskeyBusyPhase } from "@/lib/state/passkeyBusy";

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  name: string;
  handle: string;
  /** DiceBear style for the account avatar. */
  iconType?: string;
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
  /** Enrolled account-login passkeys. */
  passkeys?: AuthPasskey[];
  /** Registers a passkey on this device. */
  onAddDevice?: () => void;
  /** Opens the OTP window so a new device can log in by email. */
  onAddDeviceByEmail?: () => void;
  /** Rename a passkey label (persisted in live mode). */
  onRenamePasskey?: (id: string, label: string) => void;
  /** Remove a passkey ("kick" a device). Hidden on the last remaining passkey. */
  onRevokePasskey?: (id: string) => void;
  /** Opens donation soft-ask (GitHub Sponsors or Interac e-Transfer). */
  onDonate?: () => void;
  /** Deferred account-settings destinations (wireframe no-ops → toast). */
  onOpenSetting?: (label: string) => void;
  /** Tier-matched ID Update / Residency Update shortcut (hidden while unverified). */
  onTierMatchedUpdate?: () => void;
  passkeyBusy?: PasskeyBusyPhase | null;
}

/** Wireframe KYC_TIERS — the account's own ladder (Official is a separate role). */
const KYC_LABEL: Record<VerificationTier, string> = {
  0: "Unverified",
  1: "Identity Verified",
  2: "Residency Verified",
};

const KYC_ICON: Record<VerificationTier, LucideIcon> = {
  0: ShieldCheck,
  1: IdCard,
  2: MapPin,
};

/** KYC ladder → EntityMark specs (same fills as feed badges). */
const KYC_MARK: Record<Exclude<VerificationTier, 0>, EntityMarkSpec> = {
  1: { type: "kyc", subtype: "identity" },
  2: { type: "kyc", subtype: "residency" },
};

/** Only the first two passkeys are listed; the rest collapse to "+N more". */
const PASSKEYS_SHOWN = 2;

function PasskeyRow({
  passkey,
  onRename,
  onRevoke,
  canRevoke,
}: {
  passkey: AuthPasskey;
  onRename?: (id: string, label: string) => void;
  onRevoke?: (id: string) => void;
  /** False for the last remaining passkey — the server refuses to remove it (use recovery). */
  canRevoke?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => passkeyDisplayLabel(passkey));
  const inputRef = useRef<HTMLInputElement>(null);
  const display = passkeyDisplayLabel(passkey);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(display);
  }, [display, editing]);

  const save = () => {
    setEditing(false);
    onRename?.(passkey.id, draft);
  };

  const cancel = () => {
    setDraft(display);
    setEditing(false);
  };

  return (
    <li className="flex min-h-9 items-center gap-2 text-sm text-ink-soft">
      <Key size={15} className="shrink-0" aria-hidden />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          onBlur={save}
          className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-sm text-ink"
          aria-label="Passkey name"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{display}</span>
      )}
      {!editing ? (
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {onRename ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="shrink-0 rounded p-1 text-muted hover:bg-surface-muted hover:text-ink"
              aria-label={`Rename ${display}`}
            >
              <Pencil size={14} aria-hidden />
            </button>
          ) : null}
          {onRevoke && canRevoke ? (
            <button
              type="button"
              onClick={() => onRevoke(passkey.id)}
              className="shrink-0 rounded p-1 text-muted hover:bg-surface-muted hover:text-danger"
              aria-label={`Remove ${display}`}
            >
              <Trash2 size={14} aria-hidden />
            </button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

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
        How each action is signed. OurSay&apos;s rules for a jurisdiction may require a stronger
        method — e.g. in Alberta a passkey is always required. On the Ask confirmation screen,
        &ldquo;Remember my choice&rdquo; sets Quick or Passkey for that action (Quick skips the
        chooser next time; Passkey still confirms).
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
  iconType,
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
  passkeys = [],
  onAddDevice,
  onAddDeviceByEmail,
  onRenamePasskey,
  onRevokePasskey,
  onDonate,
  onOpenSetting,
  onTierMatchedUpdate,
  passkeyBusy = null,
}: ProfileModalProps) {
  const KycIcon = KYC_ICON[kycTier];
  const tierUpdateLabel =
    kycTier <= 0 ? null : kycTier === 1 ? "ID Update" : "Residency Update";
  const [passkeysExpanded, setPasskeysExpanded] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [signingOpen, setSigningOpen] = useState(false);
  const hidden = passkeys.length - PASSKEYS_SHOWN;
  const shownPasskeys = passkeysExpanded
    ? passkeys
    : passkeys.slice(0, PASSKEYS_SHOWN);

  return (
    <Modal open={open} onClose={onClose} variant="sheet" title="Profile" mobileFull passkeyBusy={passkeyBusy}>
      <div className="space-y-5">
        <div className="border-b border-border pb-4">
          <button
            type="button"
            aria-label="View public profile"
            onClick={onViewProfile}
            className="flex w-full items-center gap-3 rounded-lg p-1 text-left hover:bg-surface-muted"
          >
            <Avatar name={name} seed={handle} iconType={iconType} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{name}</p>
              <p className="truncate text-sm text-muted">{displayHandle(handle)}</p>
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
                  ? entityMarkForeground(
                      KYC_MARK[kycTier as Exclude<VerificationTier, 0>],
                    )
                  : "bg-ink-soft text-paper"
              }`}
              style={
                kycTier > 0
                  ? {
                      backgroundColor: entityMarkBackground(
                        KYC_MARK[kycTier as Exclude<VerificationTier, 0>],
                      ),
                    }
                  : undefined
              }
            >
              <KycIcon size={15} aria-hidden />
              {KYC_LABEL[kycTier]}
            </span>
            <Button size="sm" className="rounded-full!" onClick={onValidateId}>
              Get Verified
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            KYC tier — no PII on the public record
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">
            Devices &amp; Passkeys ({passkeys.length})
          </p>
          <ul className="space-y-1.5">
            {shownPasskeys.map((pk) => (
              <PasskeyRow
                key={pk.id}
                passkey={pk}
                onRename={onRenamePasskey}
                onRevoke={onRevokePasskey}
                canRevoke={passkeys.length > 1}
              />
            ))}
            {hidden > 0 ? (
              <li>
                <button
                  type="button"
                  onClick={() => setPasskeysExpanded((v) => !v)}
                  aria-expanded={passkeysExpanded}
                  className="pl-6 text-sm text-muted underline underline-offset-2 hover:text-ink"
                >
                  {passkeysExpanded ? "Show less" : `+${hidden} more`}
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
            {tierUpdateLabel && onTierMatchedUpdate ? (
              <SettingsRow
                icon={BadgeCheck}
                label={tierUpdateLabel}
                onClick={onTierMatchedUpdate}
              />
            ) : null}
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
            {onDonate ? (
              <SettingsRow icon={Heart} label="Donate" onClick={onDonate} />
            ) : null}
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
