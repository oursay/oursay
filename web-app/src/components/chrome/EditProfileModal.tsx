"use client";

import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { Button, Modal, ModalField } from "@/components/ui";
import {
  avatarDataUri,
  DEFAULT_USER_ICON_TYPE,
  DEFAULT_VERIFIED_USER_ICON_TYPE,
  UNVERIFIED_USER_ICON_TYPE,
  VERIFIED_USER_ICON_TYPES,
  type UserIconType,
  type VerifiedUserIconType,
  effectiveUserIconType,
} from "@/lib/avatar";
import { displayHandle, wireHandle } from "@/lib/handle";

export interface EditProfileFormData {
  handle: string;
  displayName: string;
  bio: string;
  /** Omitted when unverified (hard-wired bottts; not stored). */
  iconType?: UserIconType;
}

interface EditProfileInitial {
  handle: string;
  displayName: string;
  bio: string;
  /** Effective or stored style from account context (may be hard-wired bottts). */
  iconType?: string | null;
}

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
  initial: EditProfileInitial;
  onSubmit: (data: EditProfileFormData) => void | Promise<void>;
  busy?: boolean;
  /** Session KYC tier > 0 unlocks the verified style picker. */
  verified?: boolean;
  /** Opens Get Verified (closes Edit Profile externally). */
  onGetVerified?: () => void;
}

const BIO_MAX = 280;

const STYLE_LABELS: Record<VerifiedUserIconType, string> = {
  thumbs: "Thumbs",
  rings: "Rings",
  "shape-grid": "Shape Grid",
  shapes: "Shapes",
  stripes: "Stripes",
  triangles: "Triangles",
};

/**
 * Edit OurSay-owned public identity (handle, display name, bio, profile icon).
 * Change Email remains future — shown disabled.
 * Unverified accounts hard-wire bottts-neutral (not stored) with a Get Verified upsell.
 */
export function EditProfileModal({
  open,
  onClose,
  initial,
  onSubmit,
  busy = false,
  verified = false,
  onGetVerified,
}: EditProfileModalProps) {
  const [handle, setHandle] = useState(initial.handle);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [iconType, setIconType] = useState<UserIconType>(
    verified
      ? (effectiveUserIconType(initial.iconType, true) as UserIconType)
      : DEFAULT_VERIFIED_USER_ICON_TYPE,
  );

  useEffect(() => {
    if (!open) return;
    setHandle(initial.handle);
    setDisplayName(initial.displayName);
    setBio(initial.bio);
    if (verified) {
      setIconType(effectiveUserIconType(initial.iconType, true) as UserIconType);
    }
  }, [open, initial.handle, initial.displayName, initial.bio, initial.iconType, verified]);

  const wire = wireHandle(handle) ?? "";
  const previewSeed = wire || "preview";
  const initialIcon = verified
    ? (effectiveUserIconType(initial.iconType, true) as UserIconType)
    : null;
  const canSave =
    !busy &&
    wire.length > 0 &&
    (wire !== wireHandle(initial.handle) ||
      displayName.trim() !== initial.displayName.trim() ||
      bio.trim() !== initial.bio.trim() ||
      (verified && iconType !== initialIcon));

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title="Edit Profile" mobileFull>
      <div className="space-y-3">
        <ModalField
          label="Handle"
          placeholder="username"
          value={handle.replace(/^@/, "")}
          onChange={(e) => setHandle(e.target.value)}
          hint={wire ? displayHandle(wire) : "Letters, digits, underscore, hyphen"}
        />
        <ModalField
          label="Display Name"
          placeholder="Your public name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={80}
        />
        <ModalField
          label="Bio"
          placeholder="A short public bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          multiline
          rows={3}
          maxLength={BIO_MAX}
          hint={`${bio.length}/${BIO_MAX}`}
        />

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
            Profile Icon
          </p>
          {verified ? (
            <div className="grid grid-cols-3 gap-3">
              {VERIFIED_USER_ICON_TYPES.map((style) => {
                const selected = style === iconType;
                return (
                  <button
                    key={style}
                    type="button"
                    disabled={busy}
                    aria-label={STYLE_LABELS[style]}
                    aria-pressed={selected}
                    onClick={() => setIconType(style)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className={`inline-flex size-12 items-center justify-center overflow-hidden rounded-full ${
                        selected
                          ? "border-4 border-brand-500"
                          : "border-2 border-border hover:border-brand-300"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- static data URI */}
                      <img
                        src={avatarDataUri(previewSeed, style)}
                        alt=""
                        className="size-full rounded-full"
                      />
                    </span>
                    <span
                      className={`w-full truncate text-center text-[9px] ${
                        selected ? "font-medium text-ink" : "text-muted"
                      }`}
                    >
                      {STYLE_LABELS[style]}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-brand-500">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static data URI */}
                  <img
                    src={avatarDataUri(previewSeed, UNVERIFIED_USER_ICON_TYPE)}
                    alt=""
                    className="size-full rounded-full"
                  />
                </span>
                <p className="text-sm font-medium text-ink">Want more icons?</p>
              </div>
              {onGetVerified ? (
                <Button
                  size="sm"
                  icon={BadgeCheck}
                  fullWidth
                  disabled={busy}
                  onClick={onGetVerified}
                >
                  Get Verified
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-1.5 rounded-lg border border-border bg-surface-muted p-3 opacity-60">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Change Email</p>
          <p className="text-xs text-muted">Coming soon — email change is not available yet.</p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" fullWidth disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            fullWidth
            disabled={!canSave}
            onClick={() =>
              void onSubmit({
                handle: wire,
                displayName: displayName.trim(),
                bio: bio.trim(),
                ...(verified ? { iconType } : {}),
              })
            }
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export { DEFAULT_USER_ICON_TYPE };
