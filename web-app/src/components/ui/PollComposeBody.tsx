"use client";

import { Plus, X } from "lucide-react";
import { ModalField } from "./ModalField";

interface PollComposeBodyProps {
  options: string[];
  onChange: (options: string[]) => void;
  /** JurisdictionConfig.contentLimits.maxPollOptions (spec: <=10). */
  maxOptions?: number;
  /** Petition-attached polls label the question field differently. */
  questionLabel?: string;
  questionPlaceholder?: string;
}

const MIN_OPTIONS = 2;

/**
 * Poll editor body: question + growable option rows. Shared by the Global
 * new-poll editor and the Alberta petition's optional attached poll.
 */
export function PollComposeBody({
  options,
  onChange,
  maxOptions = 10,
  questionLabel = "Question",
  questionPlaceholder = "Ask a yes/no or multiple-choice question…",
}: PollComposeBodyProps) {
  return (
    <div className="space-y-4">
      <ModalField label={questionLabel} placeholder={questionPlaceholder} />

      <div className="space-y-2">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-muted">
          Options
        </span>
        {options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={option}
              placeholder={`Option ${i + 1}`}
              onChange={(e) =>
                onChange(options.map((o, j) => (j === i ? e.target.value : o)))
              }
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none"
            />
            <button
              type="button"
              aria-label={`Remove option ${i + 1}`}
              disabled={options.length <= MIN_OPTIONS}
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        ))}
        {options.length < maxOptions ? (
          <button
            type="button"
            onClick={() => onChange([...options, ""])}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 text-sm font-medium text-ink-soft hover:bg-surface-muted"
          >
            <Plus size={15} aria-hidden />
            Add option
          </button>
        ) : null}
        <p className="text-xs text-muted">
          {MIN_OPTIONS}–{maxOptions} options.
        </p>
      </div>
    </div>
  );
}
