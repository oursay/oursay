"use client";

import type { ReactNode } from "react";

interface RecordCardProps {
  header: ReactNode;
  body: ReactNode;
  footer: ReactNode;
  /** feed list cards use stronger border + shadow; post detail is softer. */
  variant?: "feed" | "detail";
  className?: string;
}

/**
 * Shared record shell: header · body · footer. Feed cards, post detail, and
 * comment rows all compose through this layout.
 */
export function RecordCard({
  header,
  body,
  footer,
  variant = "feed",
  className = "",
}: RecordCardProps) {
  const shell =
    variant === "feed"
      ? "rounded-xl border border-border-strong bg-surface p-3 shadow-sm"
      : "rounded-xl border border-border bg-surface p-4";

  return (
    <article className={`${shell} ${className}`}>
      {header}
      <div className="mt-1">{body}</div>
      <div className="mt-2">{footer}</div>
    </article>
  );
}
