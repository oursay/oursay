import type { ReactNode } from "react";
import { TitleLeaderRow } from "./TitleLeaderRow";
import type { OfficialLeaderRole } from "@/lib/types/jurisdiction";

interface PlaceHeaderProps {
  title: string;
  subtitle?: ReactNode;
  leaderName: string;
  /** Official seat handle — routing key. */
  leaderHandle?: string;
  /** Claimed holder's user handle — avatar seed when claimed. */
  claimedUserHandle?: string | null;
  onLeaderClick: () => void;
  claimed?: boolean;
  leaderRole?: OfficialLeaderRole;
}

/** Jurisdiction / district title card — title and leader on one line; optional subtitle below. */
export function PlaceHeader({
  title,
  subtitle,
  leaderName,
  leaderHandle,
  claimedUserHandle,
  onLeaderClick,
  claimed = true,
  leaderRole = "mla",
}: PlaceHeaderProps) {
  return (
    <header className="rounded-xl border border-border bg-surface p-4">
      <TitleLeaderRow
        title={title}
        leaderName={leaderName}
        leaderHandle={leaderHandle}
        claimedUserHandle={claimedUserHandle}
        onLeaderClick={onLeaderClick}
        claimed={claimed}
        leaderRole={leaderRole}
        variant="header"
      />
      {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
    </header>
  );
}
