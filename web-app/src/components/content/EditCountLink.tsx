"use client";

interface EditCountLinkProps {
  /** Revision count; nothing renders when absent or 0 (never revised). */
  count?: number;
  /** Opens the (deferred) edit-history timeline. */
  onClick?: () => void;
}

/** "N edit(s)" affordance — visible edits are a civic-record requirement (§3.3). */
export function EditCountLink({ count, onClick }: EditCountLinkProps) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-muted underline underline-offset-2 hover:text-ink-soft"
    >
      {count} {count === 1 ? "edit" : "edits"}
    </button>
  );
}
