"use client";

import { VenetianMask } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import type { AuthorVisibility } from "@/lib/types";
import { VISIBILITY_DESCRIPTION, VISIBILITY_LABEL } from "@/lib/types";

interface AnonymityConfirmModalProps {
  open: boolean;
  /** The visibility the viewer is switching to (null when nothing pending). */
  pending: AuthorVisibility | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirms a thread-wide anonymity change. Because anonymity is thread-bound,
 * the new setting governs the profile link behind every comment, reaction, and
 * the viewer's full activity history in this thread — so it's gated behind an
 * explicit "Change my Anonymity" step.
 */
export function AnonymityConfirmModal({
  open,
  pending,
  onCancel,
  onConfirm,
}: AnonymityConfirmModalProps) {
  return (
    <Modal
      open={open && pending !== null}
      onClose={onCancel}
      title="Change Post Anonymity?"
      size="dialog"
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2">
          <VenetianMask
            size={18}
            className="mt-0.5 shrink-0 text-ink-soft"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {pending ? VISIBILITY_LABEL[pending] : ""}
            </p>
            {pending ? (
              <p className="text-xs text-muted">
                {VISIBILITY_DESCRIPTION[pending]}
              </p>
            ) : null}
          </div>
        </div>

        <p className="text-sm leading-relaxed text-ink-soft">
          Changing the anonymity for this post controls who can see your public
          profile attached to <strong>all of your comments and reactions</strong>{" "}
          and your <strong>full activity history in this thread</strong>.
        </p>

        <div className="space-y-2 pt-1">
          <Button fullWidth onClick={onConfirm}>
            Change my Anonymity
          </Button>
          <button
            type="button"
            onClick={onCancel}
            className="mx-auto block text-sm text-muted underline underline-offset-2 hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
