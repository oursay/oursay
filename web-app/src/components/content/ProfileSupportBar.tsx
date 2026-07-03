import { CircleCheckBig, MessageSquare } from "lucide-react";
import { SquareFeather } from "@/components/ui/SquareFeather";
import { formatCount } from "@/components/utils";
import type { ProfileSupport } from "@/lib/types";

interface ProfileSupportBarProps extends ProfileSupport {
  /** Rough account age, e.g. "3 years" — rendered after "over". */
  ageLabel: string;
  /** Show the ✓/✗ agree-disagree totals pill (official accounts). */
  showReactions?: boolean;
  /** Count pill contents: statements + comments, or comments only (personas). */
  pill?: "full" | "comments";
}

/**
 * Profile support bar — same strip as the Result outcome widget, in brand
 * purple: the track shades to the member's support share with a
 * "<check> N% Support over <age>" caption. An informational count pill
 * (feather = statements, comment = comments) sits below at the bottom-right,
 * where the comment pill sits on post cards.
 */
export function ProfileSupportBar({
  agrees,
  disagrees,
  statements,
  comments,
  ageLabel,
  showReactions = false,
  pill = "full",
}: ProfileSupportBarProps) {
  const total = agrees + disagrees;
  const pct = total > 0 ? Math.round((agrees / total) * 100) : 0;
  const innerWidth = pct > 0 ? `${10000 / pct}%` : "100%";
  const text = `${pct}% Support over ${ageLabel}`;

  return (
    <div>
      <div className="relative h-7 overflow-hidden rounded-md border border-brand-600 bg-brand-300">
        {pct > 0 ? (
          <div
            className="absolute inset-y-0 left-0 bg-brand-700"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        ) : null}
        <div className="relative flex h-full items-center gap-2 px-2 text-xs font-medium text-ink">
          <CircleCheckBig size={16} className="shrink-0" aria-hidden />
          <span>{text}</span>
        </div>
        {pct > 0 ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
            aria-hidden
            style={{ width: `${pct}%` }}
          >
            <div
              className="flex h-full items-center gap-2 px-2 text-xs font-medium text-white"
              style={{ width: innerWidth }}
            >
              <CircleCheckBig size={16} className="shrink-0" />
              <span>{text}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-1.5 flex items-center">
        {showReactions ? (
          <div className="pill-chrome inline-flex h-5 items-center overflow-hidden rounded-full bg-surface text-xs text-ink-soft">
            <span className="inline-flex items-center gap-0.5 px-2">
              <span aria-hidden>✓</span>
              {formatCount(agrees)}
            </span>
            <span className="w-px shrink-0 self-stretch bg-ink" aria-hidden />
            <span className="inline-flex items-center gap-0.5 px-2">
              <span aria-hidden>✗</span>
              {formatCount(disagrees)}
            </span>
          </div>
        ) : null}
        <div className="pill-chrome ml-auto inline-flex h-5 items-center overflow-hidden rounded-full bg-surface text-xs text-ink-soft">
          {pill === "full" ? (
            <>
              <span className="inline-flex items-center gap-1 px-2">
                <SquareFeather size={11} strokeWidth={2.25} aria-hidden />
                {formatCount(statements)}
              </span>
              <span className="w-px shrink-0 self-stretch bg-ink" aria-hidden />
            </>
          ) : null}
          <span className="inline-flex items-center gap-1 px-2">
            <MessageSquare size={11} aria-hidden />
            {formatCount(comments)}
          </span>
        </div>
      </div>
    </div>
  );
}
