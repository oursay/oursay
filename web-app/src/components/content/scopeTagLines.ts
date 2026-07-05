/** A scope-tag fragment: display text and whether it is an underlined link. */
export type ScopeSegment = readonly [text: string, isLink: boolean];

/** Line 1 of an expanded multi-district tag: "Jurisdiction · District1,". */
export function buildScopeHeadLine(
  districtSlugs: string[],
  jurName: string,
  resolveDistrict: (slug: string) => string,
): ScopeSegment[] {
  const line1: ScopeSegment[] = [];
  if (jurName) {
    line1.push([jurName, true]);
    line1.push([" · ", false]);
  }
  line1.push([resolveDistrict(districtSlugs[0]!), true]);
  line1.push([",", false]);
  return line1;
}

/**
 * Packs every district after the first onto right-aligned lines below line 1.
 * "See Less" is always kept on the same line as the last district name.
 */
export function computeScopeTailLines(
  districtSlugs: string[],
  resolveDistrict: (slug: string) => string,
  maxWidth: number,
  measureWidth: (text: string) => number,
): ScopeSegment[][] {
  const rest = districtSlugs.slice(1);
  if (rest.length === 0) return [];

  const chunks: ScopeSegment[][] = [];
  rest.forEach((slug, i) => {
    const isLast = i === rest.length - 1;
    if (isLast) {
      chunks.push([
        [resolveDistrict(slug), true],
        [" · ", false],
        ["See Less", true],
      ]);
    } else {
      chunks.push([[resolveDistrict(slug), true], [", ", false]]);
    }
  });

  const lines: ScopeSegment[][] = [];
  let cur: ScopeSegment[] = [];
  let curText = "";
  for (const chunk of chunks) {
    const chunkText = chunk.map((s) => s[0]).join("");
    if (curText && measureWidth(curText + chunkText) > maxWidth) {
      lines.push(cur);
      cur = [];
      curText = "";
    }
    cur.push(...chunk);
    curText += chunkText;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/**
 * Full expanded layout (head + tail). Prefer rendering head/tail separately so
 * the tail can measure against the full card width (wireframe §9.8).
 */
export function computeScopeLines(
  districtSlugs: string[],
  jurName: string,
  resolveDistrict: (slug: string) => string,
  maxWidth: number,
  measureWidth: (text: string) => number,
): ScopeSegment[][] {
  const head = buildScopeHeadLine(districtSlugs, jurName, resolveDistrict);
  const tail = computeScopeTailLines(
    districtSlugs,
    resolveDistrict,
    maxWidth,
    measureWidth,
  );
  return [head, ...tail];
}

/** Tail fallback before layout measurement (all remaining districts on one line). */
export function fallbackScopeTailLines(
  districtSlugs: string[],
  resolveDistrict: (slug: string) => string,
): ScopeSegment[][] {
  const rest = districtSlugs.slice(1);
  if (rest.length === 0) return [];

  const line: ScopeSegment[] = [];
  rest.forEach((slug, i) => {
    line.push([resolveDistrict(slug), true]);
    line.push([i < rest.length - 1 ? ", " : " · ", false]);
  });
  line.push(["See Less", true]);
  return [line];
}

/** @deprecated Use buildScopeHeadLine + fallbackScopeTailLines. */
export function fallbackScopeLines(
  districtSlugs: string[],
  jurName: string,
  resolveDistrict: (slug: string) => string,
): ScopeSegment[][] {
  return [
    buildScopeHeadLine(districtSlugs, jurName, resolveDistrict),
    ...fallbackScopeTailLines(districtSlugs, resolveDistrict),
  ];
}
