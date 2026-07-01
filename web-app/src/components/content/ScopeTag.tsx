"use client";

import { districtName as defaultResolveDistrict } from "@/lib/mock";

interface ScopeTagProps {
  jurisdiction: string;
  districtSlugs: string[];
  hideJur?: boolean;
  hideDistrict?: boolean;
  /** slug -> display name; defaults to the mock district registry. */
  resolveDistrict?: (slug: string) => string;
  /** Controlled +N expansion (a multi-district tag expands in place). */
  expanded?: boolean;
  onExpandToggle?: () => void;
  onJurisdictionClick?: () => void;
  onDistrictClick?: (slug: string) => void;
}

const LINK =
  "underline underline-offset-2 hover:text-ink-soft disabled:no-underline disabled:cursor-default";

/**
 * Right-aligned "Jurisdiction · District" scope tag. A multi-district post shows
 * "Jur · District1 +N" collapsed; tapping +N expands to a comma-separated list of
 * every district ending in "See Less" (§9.8). Segments are muted, underlined links.
 */
export function ScopeTag({
  jurisdiction,
  districtSlugs,
  hideJur = false,
  hideDistrict = false,
  resolveDistrict = defaultResolveDistrict,
  expanded = false,
  onExpandToggle,
  onJurisdictionClick,
  onDistrictClick,
}: ScopeTagProps) {
  const jur = hideJur ? "" : jurisdiction;
  const districts = hideDistrict ? [] : districtSlugs;

  const jurLink = jur ? (
    <button type="button" className={LINK} onClick={onJurisdictionClick}>
      {jur}
    </button>
  ) : null;

  // Single (or no) district: plain "Jur · District".
  if (districts.length <= 1) {
    const slug = districts[0];
    return (
      <span className="text-right text-xs text-muted">
        {jurLink}
        {jur && slug ? " · " : ""}
        {slug ? (
          <button
            type="button"
            className={LINK}
            onClick={() => onDistrictClick?.(slug)}
          >
            {resolveDistrict(slug)}
          </button>
        ) : null}
      </span>
    );
  }

  // Multi-district collapsed: "Jur · District1 +N".
  if (!expanded) {
    const [first, ...rest] = districts;
    return (
      <span className="text-right text-xs text-muted">
        {jurLink}
        {jur ? " · " : ""}
        <button
          type="button"
          className={LINK}
          onClick={() => onDistrictClick?.(first)}
        >
          {resolveDistrict(first)}
        </button>{" "}
        <button type="button" className={LINK} onClick={onExpandToggle}>
          +{rest.length}
        </button>
      </span>
    );
  }

  // Expanded: every district, comma-separated, ending in "See Less".
  return (
    <span className="text-right text-xs text-muted">
      {jurLink}
      {jur ? " · " : ""}
      {districts.map((slug, i) => (
        <span key={slug}>
          <button
            type="button"
            className={LINK}
            onClick={() => onDistrictClick?.(slug)}
          >
            {resolveDistrict(slug)}
          </button>
          {i < districts.length - 1 ? ", " : " · "}
        </span>
      ))}
      <button type="button" className={LINK} onClick={onExpandToggle}>
        See Less
      </button>
    </span>
  );
}
