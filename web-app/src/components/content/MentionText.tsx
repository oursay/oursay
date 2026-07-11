"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { MentionsMap } from "@/lib/types";
import { mentionSegments } from "@/lib/mentions/segments";

interface MentionTextProps {
  text: string;
  mentions?: MentionsMap;
  /**
   * When false, chips are non-interactive spans (e.g. inside a feed card button).
   * Default true — persona/profile chips link via server `route`.
   */
  linkable?: boolean;
  className?: string;
}

/**
 * Render a content string with opaque `<@…>` tokens replaced by chips from
 * server `mentions` metadata. Missing map entries → non-link "Someone".
 */
export function MentionText({
  text,
  mentions,
  linkable = true,
  className,
}: MentionTextProps) {
  const segments = mentionSegments(text, mentions, linkable);
  if (segments.length === 1 && segments[0]!.type === "text") {
    return className ? (
      <span className={className}>{segments[0]!.value}</span>
    ) : (
      <>{segments[0]!.value}</>
    );
  }

  const parts: ReactNode[] = segments.map((seg, i) => {
    if (seg.type === "text") return seg.value;
    const chipClass =
      "font-semibold text-brand-700 underline-offset-2" +
      (seg.linkable ? " hover:underline" : "");
    if (seg.linkable && seg.route) {
      return (
        <Link
          key={`${seg.nodeId}-${i}`}
          href={seg.route}
          className={chipClass}
          onClick={(e) => e.stopPropagation()}
        >
          @{seg.display}
        </Link>
      );
    }
    return (
      <span key={`${seg.nodeId}-${i}`} className={chipClass}>
        @{seg.display}
      </span>
    );
  });

  return className ? <span className={className}>{parts}</span> : <>{parts}</>;
}
