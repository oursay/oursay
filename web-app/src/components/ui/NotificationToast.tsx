"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

/** Messages longer than this show a collapsed preview with expand/collapse. */
const EXPAND_THRESHOLD = 72;

interface NotificationToastProps {
  message: string;
  onDismiss: () => void;
}

/** Transient top-of-page notice — matches surface/border chrome with optional expand. */
export function NotificationToast({ message, onDismiss }: NotificationToastProps) {
  const [expanded, setExpanded] = useState(false);
  const expandable = message.length > EXPAND_THRESHOLD;

  useEffect(() => {
    setExpanded(false);
  }, [message]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto w-full max-w-md"
    >
      <div className="flex items-start gap-2 rounded-lg border border-border-strong border-l-[3px] border-l-brand-600 bg-surface px-2.5 py-2 shadow-sm">
        <p
          className={`min-w-0 flex-1 text-xs leading-snug text-ink ${!expanded && expandable ? "line-clamp-2" : ""}`}
        >
          {message}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          {expandable ? (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-label={expanded ? "Show less" : "Show more"}
              aria-expanded={expanded}
              className="inline-flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-surface-muted"
            >
              {expanded ? (
                <ChevronUp size={14} aria-hidden />
              ) : (
                <ChevronDown size={14} aria-hidden />
              )}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="inline-flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-surface-muted"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
