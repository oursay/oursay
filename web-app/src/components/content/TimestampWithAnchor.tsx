"use client";

import { FileBadge } from "lucide-react";

const ANCHOR_LABEL = "Verified on the public audit ledger";

interface TimestampWithAnchorProps {
  /** Pre-formatted time label (relative or absolute). */
  time: string;
  /** When true, show the FileBadge to the right of the time. */
  externallyAnchored?: boolean;
  className?: string;
}

/** Time label with an optional public-witness anchor badge. */
export function TimestampWithAnchor({
  time,
  externallyAnchored = false,
  className,
}: TimestampWithAnchorProps) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`.trim()}>
      <span>{time}</span>
      {externallyAnchored ? (
        <span title={ANCHOR_LABEL}>
          <FileBadge
            className="size-3.5 shrink-0 text-muted"
            aria-label={ANCHOR_LABEL}
          />
        </span>
      ) : null}
    </span>
  );
}
