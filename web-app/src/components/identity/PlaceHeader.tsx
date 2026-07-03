import type { ReactNode } from "react";
import { TitleLeaderRow } from "./TitleLeaderRow";

interface PlaceHeaderProps {
  title: string;
  subtitle?: ReactNode;
  leaderName: string;
  /** Leader's handle — avatar seed. */
  leaderHandle?: string;
  onLeaderClick: () => void;
}

/** Jurisdiction / district title card — title and leader on one line; optional subtitle below. */
export function PlaceHeader({
  title,
  subtitle,
  leaderName,
  leaderHandle,
  onLeaderClick,
}: PlaceHeaderProps) {
  return (
    <header className="rounded-xl border border-border bg-surface p-4">
      <TitleLeaderRow
        title={title}
        leaderName={leaderName}
        leaderHandle={leaderHandle}
        onLeaderClick={onLeaderClick}
        variant="header"
      />
      {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
    </header>
  );
}
