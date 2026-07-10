"use client";

import { IdCardLanyard } from "lucide-react";
import { Avatar } from "@/components/ui";
import { claimedUserHandleForSeat } from "@/lib/official-seat";
import type { OfficialLeaderRole } from "@/lib/types/jurisdiction";

interface LeaderProfileLinkProps {
  name: string;
  /** Official seat handle — used for routing, not the avatar seed when claimed. */
  handle?: string;
  /** Claimed holder's user handle — the identity-stable avatar seed. */
  claimedUserHandle?: string | null;
  onClick: () => void;
  /** Header title bar vs compact riding row. */
  size?: "md" | "sm";
  /** When false, show id-card icon instead of avatar. */
  claimed?: boolean;
  leaderRole?: OfficialLeaderRole;
}

function roleLabel(role: OfficialLeaderRole): string {
  if (role === "premier") return "Premier";
  if (role === "platform") return "Platform";
  return "MLA";
}

/** Avatar + representative name, right-aligned. Unclaimed seats use id-card + name from roster. */
export function LeaderProfileLink({
  name,
  handle,
  claimedUserHandle,
  onClick,
  size = "md",
  claimed = true,
  leaderRole = "mla",
}: LeaderProfileLinkProps) {
  const textClass =
    size === "sm" ? "text-[11px] font-medium text-ink" : "text-xs font-medium text-ink";
  const displayName = name.trim() || roleLabel(leaderRole);
  const avatarSeed = claimed
    ? (claimedUserHandle ?? claimedUserHandleForSeat(handle) ?? handle)
    : undefined;
  const iconSize = size === "sm" ? 14 : 16;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 hover:opacity-80"
    >
      {claimed ? (
        <Avatar name={displayName} seed={avatarSeed} size="sm" />
      ) : (
        <span
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-300"
          aria-hidden
        >
          <IdCardLanyard size={iconSize} className="text-ink" />
        </span>
      )}
      <span className={`whitespace-nowrap ${textClass}`}>{displayName}</span>
    </button>
  );
}
