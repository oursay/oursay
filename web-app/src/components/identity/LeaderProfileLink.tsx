"use client";

import { Avatar } from "@/components/ui";
import { OFFICIAL_SEAT_ICON_TYPE } from "@/lib/avatar";
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
  /** When false, seat is unclaimed — still disco, seeded by seat handle. */
  claimed?: boolean;
  leaderRole?: OfficialLeaderRole;
}

function roleLabel(role: OfficialLeaderRole): string {
  if (role === "premier") return "Premier";
  if (role === "platform") return "Platform";
  return "MLA";
}

/** Disco avatar + representative name, right-aligned (official seat chrome). */
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
    ? (claimedUserHandle ?? claimedUserHandleForSeat(handle) ?? handle ?? displayName)
    : (handle ?? displayName);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 hover:opacity-80"
    >
      <Avatar
        name={displayName}
        seed={avatarSeed}
        iconType={OFFICIAL_SEAT_ICON_TYPE}
        size="sm"
      />
      <span className={`whitespace-nowrap ${textClass}`}>{displayName}</span>
    </button>
  );
}
