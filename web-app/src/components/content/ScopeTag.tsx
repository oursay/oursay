"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { districtName as defaultResolveDistrict } from "@/lib/mock";
import {
  buildScopeHeadLine,
  computeScopeTailLines,
  fallbackScopeTailLines,
  type ScopeSegment,
} from "./scopeTagLines";

export type ScopeTagPart = "all" | "head" | "tail";

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
  /**
   * `head` = expanded line 1 beside @handle; `tail` = remaining districts on a
   * full-width row below; `all` = collapsed or single-district rendering.
   */
  part?: ScopeTagPart;
}

const LINK =
  "underline underline-offset-2 hover:text-ink-soft disabled:no-underline disabled:cursor-default";

const LINE = "text-right text-xs leading-4 text-muted";

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
  part = "all",
}: ScopeTagProps) {
  const jur = hideJur ? "" : jurisdiction;
  const districts = hideDistrict ? [] : districtSlugs;
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [tailLines, setTailLines] = useState<ScopeSegment[][] | null>(null);

  const measureWidth = useCallback((text: string) => {
    const node = measureRef.current;
    if (!node) return text.length * 6.5;
    node.textContent = text;
    return node.getBoundingClientRect().width;
  }, []);

  useLayoutEffect(() => {
    if (part !== "tail" || !expanded || districts.length <= 1) {
      setTailLines(null);
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth;
      if (width <= 0) {
        setTailLines(fallbackScopeTailLines(districts, resolveDistrict));
        return;
      }
      setTailLines(
        computeScopeTailLines(districts, resolveDistrict, width, measureWidth),
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [part, expanded, districts, resolveDistrict, measureWidth]);

  const districtByName = useCallback(
    (name: string) =>
      districts.find((slug) => resolveDistrict(slug) === name) ?? null,
    [districts, resolveDistrict],
  );

  const renderSegment = (seg: ScopeSegment, key: string) => {
    const [text, isLink] = seg;
    if (!isLink) return <span key={key}>{text}</span>;
    if (text === "See Less") {
      return (
        <button key={key} type="button" className={LINK} onClick={onExpandToggle}>
          See Less
        </button>
      );
    }
    if (text === jur) {
      return (
        <button key={key} type="button" className={LINK} onClick={onJurisdictionClick}>
          {text}
        </button>
      );
    }
    const slug = districtByName(text);
    return (
      <button
        key={key}
        type="button"
        className={LINK}
        onClick={() => slug && onDistrictClick?.(slug)}
      >
        {text}
      </button>
    );
  };

  const renderLine = (lineSegs: ScopeSegment[], key: string) => (
    <div key={key} className={LINE}>
      {lineSegs.map((seg, si) => renderSegment(seg, `${key}-${si}`))}
    </div>
  );

  const jurLink = jur ? (
    <button type="button" className={LINK} onClick={onJurisdictionClick}>
      {jur}
    </button>
  ) : null;

  // Tail only: remaining districts on a full-width row below the author block.
  if (part === "tail") {
    if (!expanded || districts.length <= 1) return null;
    const displayLines =
      tailLines ?? fallbackScopeTailLines(districts, resolveDistrict);
    return (
      <div ref={containerRef} className="relative w-full min-w-0">
        <span
          ref={measureRef}
          className="pointer-events-none invisible absolute text-xs"
          aria-hidden
        />
        {displayLines.map((lineSegs, li) => renderLine(lineSegs, `tail-${li}`))}
      </div>
    );
  }

  // Single (or no) district: plain "Jur · District".
  if (districts.length <= 1) {
    const slug = districts[0];
    return (
      <span className={`${LINE} whitespace-nowrap`}>
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
      <span className={`${LINE} whitespace-nowrap`}>
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

  // Expanded head: line 1 beside @handle ("Jur · District1,").
  if (part === "head") {
    return (
      <span className={`${LINE} whitespace-nowrap`}>
        {buildScopeHeadLine(districts, jur, resolveDistrict).map((seg, si) =>
          renderSegment(seg, `head-${si}`),
        )}
      </span>
    );
  }

  return null;
}
