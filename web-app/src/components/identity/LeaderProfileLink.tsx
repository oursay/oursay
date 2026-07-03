"use client";

import { Avatar } from "@/components/ui";

interface LeaderProfileLinkProps {
  name: string;
  /** Leader's handle — the identity-stable avatar seed. */
  handle?: string;
  onClick: () => void;
  /** Header title bar vs compact riding row. */
  size?: "md" | "sm";
}

/** Avatar + full name, right-aligned — wireframe leaderLink(). */
export function LeaderProfileLink({
  name,
  handle,
  onClick,
  size = "md",
}: LeaderProfileLinkProps) {
  const textClass =
    size === "sm" ? "text-[11px] font-medium text-ink" : "text-xs font-medium text-ink";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 hover:opacity-80"
    >
      <Avatar name={name} seed={handle} size="sm" />
      <span className={`whitespace-nowrap ${textClass}`}>{name}</span>
    </button>
  );
}
