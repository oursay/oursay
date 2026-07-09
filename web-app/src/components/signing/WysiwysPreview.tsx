"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { NoticeBox } from "@/components/ui";
import { jurisdictionIconForId } from "@/lib/jurisdiction-icon";
import { WYSIWYS_LEARN_MORE_URL } from "@/lib/signing/constants";
import type { TechnicalRow, WysiwysPayload, WysiwysWarning } from "@/lib/signing/wysiwys-types";

function WireTag({ tag }: { tag: string }) {
  return (
    <span className="ml-1.5 rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted">
      &lt;{tag}&gt;
    </span>
  );
}

function TechnicalRowView({ row }: { row: TechnicalRow }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1 text-xs text-ink-soft">
      <span className="font-medium text-ink">{row.label}:</span>
      <span>{row.value}</span>
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
export function WysiwysPreview({
  leadLines,
  technicalRows,
  warnings,
}: WysiwysPreviewProps) {
  return (
    <div className="space-y-3">
      <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-muted p-4 text-sm leading-relaxed text-ink">
        <div className="space-y-2">
          {leadLines.map((line, i) => (
            <p key={i} className={i === 0 ? "font-medium" : undefined}>
              {line}
            </p>
          ))}
        </div>
        {technicalRows.length > 0 ? (
          <div className="mt-3 space-y-1.5 border-t border-border pt-3">
            {technicalRows.map((row) => (
              <TechnicalRowView key={row.label} row={row} />
            ))}
          </div>
        ) : null}
      </div>

      {warnings.map((w, i) => (
        <WarningBox key={`${w.kind}-${i}`} warning={w} />
      ))}

      <p className="text-sm text-ink">
        I agree — I am authorizing this specific signed append to the public record.
      </p>

      <p className="text-center text-xs leading-relaxed text-muted">
        This creates a tamper-evident, permanent public record. Anyone with the raw contents can
        verify this action was signed by you.{" "}
        <Link href={WYSIWYS_LEARN_MORE_URL} className="underline underline-offset-2">
          Learn more
        </Link>
      </p>
    </div>
  );
}
