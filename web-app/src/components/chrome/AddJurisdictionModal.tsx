"use client";

import { Search } from "lucide-react";
import { jurisdictionIconForName } from "@/lib/jurisdiction-icon";
import { Modal, ModalOptionRow } from "@/components/ui";

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
  const AlbertaIcon = jurisdictionIconForName("Alberta");

  return (
    <Modal open={open} onClose={onClose} size="wide" showDismissHint>
      <div className="space-y-0">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3">
          <Search size={16} className="text-muted" aria-hidden />
          <input
            type="text"
            placeholder="Search jurisdictions…"
            className="min-h-10 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
        </div>
        <div className="my-3 border-t border-border" />
        <ModalOptionRow
          label="Alberta"
          icon={<AlbertaIcon size={18} aria-hidden />}
          trailing="Join ›"
          onClick={() => onJoin?.("Alberta")}
        />
        <p className="mt-3 text-xs text-muted">
          (Only Alberta is reachable at launch.)
        </p>
      </div>
    </Modal>
  );
}
