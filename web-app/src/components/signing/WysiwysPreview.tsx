"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { NoticeBox } from "@/components/ui";
import { jurisdictionIconForId } from "@/lib/jurisdiction-icon";
import { WYSIWYS_LEARN_MORE_URL } from "@/lib/signing/constants";
import type { TechnicalRow, WysiwysPayload, WysiwysWarning } from "@/lib/signing/wysiwys-types";

function WireTag({ tag }: { tag: string }) {
  return <span className="ml-0.5 font-mono text-[11px] text-muted">&lt;{tag}&gt;</span>;
}

/** Inline metadata row — stays on one line; the group scrolls horizontally as a whole. */
function TechnicalRowView({ row }: { row: TechnicalRow }) {
  return (
    <div className="flex items-baseline gap-x-0.5 whitespace-nowrap text-xs text-ink-soft">
      <span className="font-medium text-ink">{row.label}:</span>
      {row.value ? <span>{row.value}</span> : null}
      {row.wireTag && row.wireTag !== row.value ? <WireTag tag={row.wireTag} /> : null}
    </div>
  );
}

/**
 * Human-content row — value wraps onto its own lines. Capped at 100cqw (the visible
 * box width) so it wraps at the viewport while still translating with horizontal scroll.
 */
function ParagraphRowView({ row }: { row: TechnicalRow }) {
  return (
    <div className="max-w-[100cqw] break-words text-xs text-ink-soft">
      <span className="font-medium text-ink">{row.label}:</span>{" "}
      {row.value ? <span>{row.value}</span> : null}
      {row.wireTag && row.wireTag !== row.value ? <WireTag tag={row.wireTag} /> : null}
    </div>
  );
}

function WarningBox({ warning }: { warning: WysiwysWarning }) {
  const Icon = jurisdictionIconForId(warning.jurisdictionId);
  const jur = warning.jurisdictionLabel;

  if (warning.kind === "irrevocable") {
    const noun = warning.irrevocableNoun ?? "actions";
    return (
      <NoticeBox
        tone="danger"
        icon={<AlertTriangle size={16} aria-hidden />}
        lines={[
          `${jur} does not allow ${noun} to be revoked or changed after submission.`,
          "This action is permanent on the public record.",
        ]}
      />
    );
  }

  if (warning.kind === "residency") {
    return (
      <NoticeBox
        tone="notice"
        icon={<Icon size={16} aria-hidden />}
        lines={[
          `OurSay official counts for ${jur}`,
          "only include verified residents —",
          "this action may not count toward official totals until you verify residency.",
        ]}
      />
    );
  }

  return (
    <NoticeBox
      tone="info"
      icon={<Icon size={16} aria-hidden />}
      lines={[
        "Officials can filter results to exclude",
        "unaffected users, even though OurSay",
        "includes you in the official count.",
      ]}
    />
  );
}

export type WysiwysPreviewProps = WysiwysPayload;

/**
 * Presentation-only WYSIWYS surface — scrollable preview of the signed payload,
 * disclaimer, fine print, and jurisdiction-aware warnings.
 */
export function WysiwysPreview({ technicalRows, warnings }: WysiwysPreviewProps) {
  const paragraphRows = technicalRows.filter((r) => r.variant === "paragraph");
  const inlineRows = technicalRows.filter((r) => r.variant !== "paragraph");
  return (
    <div className="space-y-3">
      <div className="scrollbar-thin @container max-h-48 overflow-auto rounded-lg bg-brand-200 px-3 pt-3">
        {/* Single scroll surface: paragraphs and inline rows translate together. */}
        <div className="w-max min-w-full space-y-1.5">
          {paragraphRows.map((row) => (
            <ParagraphRowView key={row.label} row={row} />
          ))}
          {inlineRows.map((row) => (
            <TechnicalRowView key={row.label} row={row} />
          ))}
        </div>
      </div>

      {warnings.map((w, i) => (
        <WarningBox key={`${w.kind}-${i}`} warning={w} />
      ))}

      <p className="text-center text-sm text-ink">
        I agree — I am authorizing this specific signed append to the public record.
      </p>

      <p className="text-center text-xs leading-relaxed text-muted">
        <Link href={WYSIWYS_LEARN_MORE_URL} className="underline underline-offset-2">
          Disclaimer
        </Link>
      </p>
    </div>
  );
}
