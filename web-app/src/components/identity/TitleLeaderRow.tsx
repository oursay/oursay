"use client";

import { LeaderProfileLink } from "./LeaderProfileLink";

interface TitleLeaderRowProps {
  title: string;
  leaderName: string;
  /** Leader's handle — avatar seed. */
  leaderHandle?: string;
  onLeaderClick: () => void;
  onTitleClick?: () => void;
  variant?: "header" | "row";
}

/** One-line riding title + leader link — leader keeps full width; title truncates on overflow. */
export function TitleLeaderRow({
  title,
  leaderName,
  leaderHandle,
  onLeaderClick,
  onTitleClick,
  variant = "row",
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

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      {titleNode}
      <LeaderProfileLink
        name={leaderName}
        handle={leaderHandle}
        size={variant === "row" ? "sm" : "md"}
        onClick={onLeaderClick}
      />
    </div>
  );
}
