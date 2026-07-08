"use client";

import { LeaderProfileLink } from "./LeaderProfileLink";
import type { OfficialLeaderRole } from "@/lib/types/jurisdiction";

interface TitleLeaderRowProps {
  title: string;
  leaderName: string;
  /** Official seat handle — routing key. */
  leaderHandle?: string;
  /** Claimed holder's user handle — avatar seed when claimed. */
  claimedUserHandle?: string | null;
  onLeaderClick: () => void;
  onTitleClick?: () => void;
  variant?: "header" | "row";
  claimed?: boolean;
  leaderRole?: OfficialLeaderRole;
}

/** One-line riding title + leader link — leader keeps full width; title truncates on overflow. */
export function TitleLeaderRow({
  title,
  leaderName,
  leaderHandle,
  claimedUserHandle,
  onLeaderClick,
  onTitleClick,
  variant = "row",
  claimed = true,
  leaderRole = "mla",
}: TitleLeaderRowProps) {
  const titleClass =
    variant === "header"
      ? "min-w-0 flex-1 truncate text-base font-bold text-ink"
      : "min-w-0 flex-1 truncate text-left text-xs font-semibold text-ink";

  const titleNode =
    onTitleClick ? (
      <button
        type="button"
        onClick={onTitleClick}
        className={titleClass}
        title={title}
      >
        {title}
      </button>
    ) : (
      <h2 className={titleClass} title={title}>
        {title}
      </h2>
    );

  const hasLeader = leaderName.trim().length > 0 || !claimed;

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      {titleNode}
      {hasLeader ? (
        <LeaderProfileLink
          name={leaderName}
          handle={leaderHandle}
          claimedUserHandle={claimedUserHandle}
          size={variant === "row" ? "sm" : "md"}
          claimed={claimed}
          leaderRole={leaderRole}
          onClick={onLeaderClick}
        />
      ) : null}
    </div>
  );
}
