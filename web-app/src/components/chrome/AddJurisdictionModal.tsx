"use client";

import { Building2, Search } from "lucide-react";
import { Modal } from "@/components/ui";

interface AddJurisdictionModalProps {
  open: boolean;
  onClose: () => void;
  /** Join the spotlighted jurisdiction (only Alberta is reachable at launch). */
  onJoin?: (name: string) => void;
}

/** Add-jurisdiction spotlight (search + the one reachable jurisdiction). */
export function AddJurisdictionModal({
  open,
  onClose,
  onJoin,
}: AddJurisdictionModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Add Jurisdiction">
      <div className="mt-2 space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3">
          <Search size={16} className="text-muted" aria-hidden />
          <input
            type="text"
            placeholder="Search jurisdictions…"
            className="min-h-10 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => onJoin?.("Alberta")}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border px-3 text-sm text-ink hover:bg-surface-muted"
        >
          <Building2 size={16} aria-hidden />
          Alberta
          <span className="ml-auto text-xs text-muted">Join ›</span>
        </button>
        <p className="text-xs text-muted">
          (Only Alberta is reachable at launch.)
        </p>
      </div>
    </Modal>
  );
}
