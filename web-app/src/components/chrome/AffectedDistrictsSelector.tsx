"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Globe, Search } from "lucide-react";
import type { DistrictSummary } from "@/lib/types";
import { CheckboxIndicator, CheckboxRow } from "@/components/ui";

interface AffectedDistrictsSelectorProps {
  /** Districts in the selected jurisdiction (hidden when empty). */
  districts: DistrictSummary[];
  /** Selected riding slugs; empty = whole jurisdiction. */
  value: string[];
  onChange: (slugs: string[]) => void;
}

function selectionLabel(value: string[], districts: DistrictSummary[]): string {
  if (value.length === 0) return "Whole Jurisdiction";
  if (value.length === 1) {
    const match = districts.find((d) => d.slug === value[0]);
    return match?.name ?? value[0]!;
  }
  return `${value.length} districts`;
}

/**
 * Compose-only affected-district picker: whole jurisdiction or one/more ridings,
 * with search for long lists (spotlight-style filter).
 */
export function AffectedDistrictsSelector({
  districts,
  value,
  onChange,
}: AffectedDistrictsSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return districts;
    return districts.filter((d) => d.name.toLowerCase().includes(needle));
  }, [districts, query]);

  if (districts.length === 0) return null;

  const whole = value.length === 0;

  const toggleDistrict = (slug: string) => {
    if (value.includes(slug)) {
      const next = value.filter((s) => s !== slug);
      onChange(next);
      return;
    }
    onChange([...value, slug]);
  };

  return (
    <div className="relative min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
        Affected Districts
      </p>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 text-sm font-medium text-ink hover:bg-surface"
      >
        <Globe size={18} className="shrink-0 text-ink-soft" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">
          {selectionLabel(value, districts)}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label="Affected districts"
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border-strong bg-surface p-2 shadow-lg"
        >
          <div className="relative">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3">
              <Search size={16} className="shrink-0 text-muted" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search districts"
                className="min-h-9 w-full flex-1 bg-transparent text-sm text-ink focus:outline-none"
              />
            </div>
            {!query ? (
              <span
                className="pointer-events-none absolute inset-y-0 left-9 flex items-center text-sm text-muted"
                aria-hidden
              >
                Search
              </span>
            ) : null}
          </div>
          <div className="my-2 border-t border-border" />
          <CheckboxRow
            label="Whole Jurisdiction"
            checked={whole}
            icon={<Globe size={16} aria-hidden />}
            onToggle={() => onChange([])}
            onSelect={() => onChange([])}
          />
          <div className="max-h-48 space-y-0.5 overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted">No matches.</p>
            ) : (
              filtered.map((d) => {
                const selected = value.includes(d.slug);
                return (
                  <CheckboxRow
                    key={d.slug}
                    label={d.name}
                    checked={selected}
                    onToggle={() => toggleDistrict(d.slug)}
                    onSelect={() => toggleDistrict(d.slug)}
                  />
                );
              })
            )}
          </div>
          {value.length > 0 ? (
            <div className="mt-2 flex justify-end border-t border-border pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ink hover:bg-surface-muted"
              >
                <Check size={14} aria-hidden />
                Done
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
