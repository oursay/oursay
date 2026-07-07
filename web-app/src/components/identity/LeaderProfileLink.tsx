"use client";

import { Gavel } from "lucide-react";
import { Avatar } from "@/components/ui";
import type { OfficialLeaderRole } from "@/lib/types/jurisdiction";

interface LeaderProfileLinkProps {
  name: string;
  /** Leader's handle — the identity-stable avatar seed. */
  handle?: string;
  onClick: () => void;
  /** Header title bar vs compact riding row. */
  size?: "md" | "sm";
  /** When false, show gavel + role label instead of avatar + name. */
  claimed?: boolean;
  leaderRole?: OfficialLeaderRole;
}

function roleLabel(role: OfficialLeaderRole): string {
  if (role === "premier") return "Premier";
  if (role === "platform") return "Platform";
  return "MLA";
}

/** Avatar + full name, right-aligned — wireframe leaderLink(). Unclaimed seats use gavel + role. */
export function LeaderProfileLink({
  name,
  handle,
  onClick,
  size = "md",
  claimed = true,
  leaderRole = "mla",
}: LeaderProfileLinkProps) {
  const textClass =
    size === "sm" ? "text-[11px] font-medium text-ink" : "text-xs font-medium text-ink";
  const displayName = claimed ? name : roleLabel(leaderRole);
  const iconSize = size === "sm" ? 14 : 16;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 hover:opacity-80"
    >
      {claimed ? (
        <Avatar name={name} seed={handle} size="sm" />
      ) : (
        <span
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-300"
          aria-hidden
        >
          <Gavel size={iconSize} className="text-ink" />
        </span>
      )}
      <span className={`whitespace-nowrap ${textClass}`}>{displayName}</span>
    </button>
  );
}
