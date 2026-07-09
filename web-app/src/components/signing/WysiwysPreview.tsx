"use client";

import { IdCard, Lock, MapPinCheck, OctagonX, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
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

/** Region label with its jurisdiction glyph inline (Globe / Landmark). */
function JurLabel({ id, label }: { id: string; label: string }) {
  const Icon = jurisdictionIconForId(id);
  return (
    <span className="inline-flex items-baseline gap-1 font-medium">
      <Icon size={12} aria-hidden className="translate-y-px" />
      {label}
    </span>
  );
}

type WarningTone = "danger" | "notice" | "info";

const WARNING_TONE: Record<WarningTone, string> = {
  danger: "text-danger-700",
  notice: "text-notice-700",
  info: "text-ink-soft",
};

function warningIcon(w: WysiwysWarning): LucideIcon {
  switch (w.kind) {
    case "irrevocable":
      return Lock;
    case "blocker":
      return OctagonX;
    case "affected":
      return MapPinCheck;
    case "count-floor":
      return w.countBasis === "identity" ? IdCard : MapPinCheck;
  }
}

function warningTone(w: WysiwysWarning): WarningTone {
  if (w.kind === "irrevocable" || w.kind === "blocker") return "danger";
  if (w.kind === "count-floor") return "notice";
  return "info";
}

function warningCopy(w: WysiwysWarning): ReactNode {
  const jur = <JurLabel id={w.jurisdictionId} label={w.jurisdictionLabel} />;
  switch (w.kind) {
    case "irrevocable":
      return (
        <>
          Permanent — {jur} does not allow {w.irrevocableNoun ?? "actions"} to be changed or
          revoked after signing.
        </>
      );
    case "blocker":
      return (
        <>
          <span className="font-semibold">Cannot participate.</span> {jur}{" "}
          {w.reason ?? "restricts this action"}.
        </>
      );
    case "count-floor":
      return w.countBasis === "identity" ? (
        <>
          {jur} official counts require ID verification — this may not count officially until
          you verify your ID.
        </>
      ) : (
        <>
          {jur} official counts include verified residents only — this may not count officially
          until you verify residency.
        </>
      );
    case "affected":
      return (
        <>
          You&apos;re outside the affected districts — officials may filter you out, though OurSay
          still includes you in the {jur} count.
        </>
      );
  }
}

/** Icon-led warning bullet — glyph signals the category at a glance. */
function WarningBullet({ warning }: { warning: WysiwysWarning }) {
  const Icon = warningIcon(warning);
  return (
    <li
      className={`flex items-start gap-2 text-xs leading-relaxed ${WARNING_TONE[warningTone(warning)]}`}
    >
      <Icon size={15} aria-hidden className="mt-0.5 shrink-0" />
      <span>{warningCopy(warning)}</span>
    </li>
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

      {warnings.length > 0 ? (
        <ul className="space-y-2">
          {warnings.map((w, i) => (
            <WarningBullet key={`${w.kind}-${i}`} warning={w} />
          ))}
        </ul>
      ) : null}

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
