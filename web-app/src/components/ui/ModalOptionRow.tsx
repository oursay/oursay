import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface ModalOptionRowProps {
  label: string;
  icon?: ReactNode;
  /** Right-side note (e.g. "Residency-verified only") — hides the chevron. */
  trailing?: string;
  trailingTone?: "default" | "destructive";
  disabled?: boolean;
  onClick?: () => void;
}

/** Picker row for modal dialogs — icon, label, chevron (wireframe where/type steps). */
export function ModalOptionRow({
  label,
  icon,
  trailing,
  trailingTone = "default",
  disabled = false,
  onClick,
}: ModalOptionRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
        disabled
          ? "cursor-not-allowed border-border/70 bg-surface-muted text-muted"
          : "border-border bg-surface text-ink hover:bg-surface-muted"
      }`}
    >
      {icon ? <span className="shrink-0 text-ink-soft">{icon}</span> : null}
      <span className={`flex-1 font-medium ${disabled ? "text-muted" : "text-ink"}`}>
        {label}
      </span>
      {trailing ? (
        <span
          className={`shrink-0 text-[10px] ${
            trailingTone === "destructive" ? "text-danger-700" : "text-muted"
          }`}
        >
          {trailing}
        </span>
      ) : (
        <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
      )}
    </button>
  );
}
