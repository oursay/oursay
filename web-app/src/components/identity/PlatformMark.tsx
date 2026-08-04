"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import type { PillDisplayMode } from "@/lib/types";

/**
 * Platform mark — purple globe for platform-scoped `admin` (and future platform roles).
 *
 * Naming: current UI calls these "pills"; the roadmap target is `marks` /
 * `Mark` components (see .agents/plans/V1-ROADMAP.md). Rename in a follow-up —
 * do not rename VerificationPill / SignedPill in V1-A.
 */
interface PlatformMarkProps {
  mode?: PillDisplayMode;
  align?: "left" | "right";
}

const LABEL = "Platform";

export function PlatformMark({ mode = "full", align = "left" }: PlatformMarkProps) {
  if (mode === "icon") {
    return <ExpandablePlatformMark align={align} />;
  }

  return (
    <span
      data-testid="platform-mark"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium leading-tight text-white bg-mark-platform ${align === "right" ? "ml-auto" : ""}`}
    >
      <Globe size={10} aria-hidden />
      {LABEL}
    </span>
  );
}

function ExpandablePlatformMark({ align }: { align: "left" | "right" }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      data-testid="platform-mark"
      aria-label={LABEL}
      aria-expanded={expanded}
      data-expanded={expanded || undefined}
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
      onMouseLeave={() => setExpanded(false)}
      onBlur={() => setExpanded(false)}
      className={`group inline-flex h-4 min-w-4 shrink-0 items-center justify-center gap-0.5 rounded-full px-0 text-[10px] font-medium leading-tight text-white bg-mark-platform transition-[padding] ${align === "right" ? "ml-auto" : ""} hover:px-1.5 data-[expanded]:px-1.5`}
    >
      <Globe size={10} aria-hidden className="shrink-0" />
      <span className="hidden whitespace-nowrap group-hover:inline group-data-[expanded]:inline">
        {LABEL}
      </span>
    </button>
  );
}
