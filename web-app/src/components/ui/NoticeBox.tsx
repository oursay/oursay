import type { ReactNode } from "react";

type Tone = "notice" | "danger" | "info";

const TONES: Record<Tone, string> = {
  notice: "border-notice-200 bg-notice-50 text-notice-700",
  danger: "border-danger-200 bg-danger-50 text-danger-700",
  info: "border-border bg-surface-muted text-ink-soft",
};

interface NoticeBoxProps {
  tone?: Tone;
  /** Each string renders on its own line (matches the wireframe's hand-wrapped notices). */
  lines: string[];
  icon?: ReactNode;
}

/** A bold-text notice card — SignModal FINAL / residency / affected boxes. */
export function NoticeBox({ tone = "notice", lines, icon }: NoticeBoxProps) {
  return (
    <div
      className={`flex gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${TONES[tone]}`}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="space-y-0.5">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}
