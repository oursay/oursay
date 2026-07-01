interface ModalFieldProps {
  label?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: string;
}

/** Labelled input styled like the wireframe compose/register fields. */
export function ModalField({
  label,
  placeholder,
  multiline = false,
  rows = 4,
  maxLength,
  hint,
}: ModalFieldProps) {
  const className =
    "w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none";

  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">
          {label}
        </span>
      ) : null}
      {multiline ? (
        <textarea
          rows={rows}
          placeholder={placeholder}
          maxLength={maxLength}
          className={className}
        />
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          maxLength={maxLength}
          className={className}
        />
      )}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </label>
  );
}
