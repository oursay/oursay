"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { jurisdictionIconForName } from "@/lib/jurisdiction-icon";
import { ALL_JURISDICTIONS } from "@/lib/mock/jurisdictions";
import type { JurisdictionMembership } from "@/lib/types";
import { Modal, ModalOptionRow } from "@/components/ui";

interface AddJurisdictionModalProps {
  open: boolean;
  onClose: () => void;
  subscriptions: JurisdictionMembership[];
  onJoin?: (name: string) => void;
  onDelete?: (name: string) => void;
}

/** Add-jurisdiction spotlight — search all jurisdictions, join or leave. */
export function AddJurisdictionModal({
  open,
  onClose,
  subscriptions,
  onJoin,
  onDelete,
}: AddJurisdictionModalProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const subscribed = useMemo(
    () => new Set(subscriptions.map((sub) => sub.name)),
    [subscriptions],
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ALL_JURISDICTIONS;
    return ALL_JURISDICTIONS.filter((name) =>
      name.toLowerCase().includes(needle),
    );
  }, [query]);

  return (
    <Modal open={open} onClose={onClose} size="wide">
      <div className="space-y-0">
        <div className="relative w-full">
          <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-muted px-3">
            <Search size={16} className="shrink-0 text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search jurisdictions"
              className="min-h-10 w-full flex-1 bg-transparent text-sm text-ink focus:outline-none"
            />
          </div>
          {!query ? (
            <span
              className="pointer-events-none absolute inset-y-0 left-9 flex items-center text-sm text-muted"
              aria-hidden
            >
              Search
            </span>
          ) : null}
        </div>
        <div className="my-3 border-t border-border" />
        <div className="space-y-2">
          {results.map((name) => {
            const Icon = jurisdictionIconForName(name);
            const isSubscribed = subscribed.has(name);
            const isLastSub = isSubscribed && subscriptions.length <= 1;
            return (
              <ModalOptionRow
                key={name}
                label={name}
                icon={<Icon size={18} aria-hidden />}
                trailing={isSubscribed ? "Delete ✕" : "Join ›"}
                trailingTone={isSubscribed ? "destructive" : "default"}
                disabled={isLastSub}
                onClick={() =>
                  isSubscribed ? onDelete?.(name) : onJoin?.(name)
                }
              />
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
