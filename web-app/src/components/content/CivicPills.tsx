"use client";

import { CircleCheckBig, ClipboardPenLine } from "lucide-react";
import { formatCount } from "@/components/utils";

const pillBase =
  "pill-chrome inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs transition-colors";

function pillStyles(participated: boolean) {
  return participated
    ? "bg-brand-100 font-bold text-brand-700"
    : "bg-surface text-ink-soft hover:bg-brand-100/60";
}

interface CivicPillProps {
  count: number;
  /** Viewer signed / voted — purple accent like reaction selection. */
  participated?: boolean;
  onClick?: () => void;
  className?: string;
}

/** Petition signature count — matches CommentPill / reaction chrome. */
export function SignaturePill({
  count,
  participated = false,
  onClick,
  className = "",
}: CivicPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={participated}
      aria-label="View petition"
      className={`${pillBase} ${pillStyles(participated)} ${onClick ? "cursor-pointer" : "cursor-default"} ${className}`}
    >
      <ClipboardPenLine size={11} aria-hidden />
      {formatCount(count)}
    </button>
  );
}

/** Poll vote total — matches CommentPill / reaction chrome. */
export function VotePill({
  count,
  participated = false,
  onClick,
  className = "",
}: CivicPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={participated}
      aria-label="View poll"
      className={`${pillBase} ${pillStyles(participated)} ${onClick ? "cursor-pointer" : "cursor-default"} ${className}`}
    >
      <CircleCheckBig size={11} aria-hidden />
      {formatCount(count)}
    </button>
  );
}
