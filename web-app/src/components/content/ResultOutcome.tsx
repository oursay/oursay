import { CircleCheckBig } from "lucide-react";
import { resultOutcomeInfo } from "@/lib/read-model";
import type { RecordOption } from "@/lib/types";

interface ResultOutcomeProps {
  options: RecordOption[];
  /** Used when options are missing (wireframe fallback). */
  outcome?: string;
}

/**
 * Compact closed-poll summary strip — track shaded to the winning share, with
 * "Closed · N% Support|Oppose" copy. Used on result cards and in poll → Result
 * interlinks (not the full option breakdown).
 */
export function ResultOutcome({ options, outcome }: ResultOutcomeProps) {
  const info = resultOutcomeInfo(options, outcome);
  const supportWins = info.winner === "Support";
  const fillPct = info.pct * 100;
  const innerWidth = fillPct > 0 ? `${10000 / fillPct}%` : "100%";

  return (
    <div
      className={`relative h-7 overflow-hidden rounded-md border bg-brand-100 ${
        supportWins ? "border-brand-600" : "border-brand-200"
      }`}
    >
      {fillPct > 0 ? (
        <div
          className={`absolute inset-y-0 left-0 ${supportWins ? "bg-brand-700" : "bg-brand-300"}`}
          style={{ width: `${fillPct}%` }}
          aria-hidden
        />
      ) : null}
      <div className="relative flex h-full items-center gap-2 px-2 text-xs font-medium text-brand-900">
        <CircleCheckBig size={16} className="shrink-0" aria-hidden />
        <span>{info.text}</span>
      </div>
      {fillPct > 0 ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
          aria-hidden
          style={{ width: `${fillPct}%` }}
        >
          <div
            className={`flex h-full items-center gap-2 px-2 text-xs font-medium ${
              supportWins ? "text-white" : "text-brand-900"
            }`}
            style={{ width: innerWidth }}
          >
            <CircleCheckBig size={16} className="shrink-0" />
            <span>{info.text}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
