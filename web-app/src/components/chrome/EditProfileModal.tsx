"use client";

import { useEffect, useState } from "react";
import { Button, Modal, ModalField } from "@/components/ui";
import { displayHandle, wireHandle } from "@/lib/handle";

export interface EditProfileFormData {
  handle: string;
  displayName: string;
  bio: string;
}

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
  initial: EditProfileFormData;
  onSubmit: (data: EditProfileFormData) => void | Promise<void>;
  busy?: boolean;
}

const BIO_MAX = 280;

/**
 * Edit OurSay-owned public identity (handle, display name, bio).
 * Change Email and Profile Icon are future — shown disabled.
 */
export function EditProfileModal({
  open,
  onClose,
  initial,
  onSubmit,
  busy = false,
}: EditProfileModalProps) {
  const [handle, setHandle] = useState(initial.handle);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);

  useEffect(() => {
    if (!open) return;
    setHandle(initial.handle);
    setDisplayName(initial.displayName);
    setBio(initial.bio);
  }, [open, initial.handle, initial.displayName, initial.bio]);

  const wire = wireHandle(handle) ?? "";
  const canSave =
    !busy &&
    wire.length > 0 &&
    (wire !== wireHandle(initial.handle) ||
      displayName.trim() !== initial.displayName.trim() ||
      bio.trim() !== initial.bio.trim());

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

        <div className="space-y-1.5 rounded-lg border border-border bg-surface-muted p-3 opacity-60">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Change Email</p>
          <p className="text-xs text-muted">Coming soon — email change is not available yet.</p>
        </div>
        <div className="space-y-1.5 rounded-lg border border-border bg-surface-muted p-3 opacity-60">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Profile Icon</p>
          <p className="text-xs text-muted">
            Coming soon — choose a DiceBear style for your avatar.
          </p>
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
