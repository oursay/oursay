// Named boundary datasets per jurisdiction. Operators select a set by id (`2019` | `2023`) or
// `latest` (greatest effectiveDate). Paths are relative to the monorepo root.

import { join } from "node:path";
import { paths } from "../config.js";
import { ShapefileSource, type BoundarySource } from "./source.js";

export interface BoundarySetMeta {
  /** Operator-facing set id (e.g. "2019", "2023"). */
  id: string;
  jurisdictionId: string;
  effectiveDate: string;
  boundaryYear: number;
  /** Human label for logs. */
  label: string;
  build(repoRoot?: string): BoundarySource;
}

const DATA = (repoRoot: string) =>
  join(repoRoot, "jurisdiction-data", "ab-ca-gov", "districts", "ElectionsAlberta");

/** Alberta Bill-33 2019 districts + 2023 voting-area dissolve. */
export const AB_CA_GOV_BOUNDARY_SETS: readonly BoundarySetMeta[] = [
  {
    id: "2019",
    jurisdictionId: "ab-ca-gov",
    effectiveDate: "2019-04-16",
    boundaryYear: 2019,
    label: "Bill-33 enacted districts (2019 election)",
    build(repoRoot = paths.repoRoot) {
      return new ShapefileSource({
        sourceId: "ElectionsAlberta/EDS_ENACTED_BILL33_15DEC2017",
        jurisdictionId: "ab-ca-gov",
        effectiveDate: "2019-04-16",
        drawnDate: "2017-12-15",
        boundaryYear: 2019,
        srid: 3401,
        shpPath: join(DATA(repoRoot), "2019", "EDS_ENACTED_BILL33_15DEC2017.shp"),
        fieldMap: { name: "EDName2017", ref: "EDNumber20" },
      });
    },
  },
  {
    id: "2023",
    jurisdictionId: "ab-ca-gov",
    effectiveDate: "2023-05-29",
    boundaryYear: 2023,
    label: "2023 voting areas dissolved to ridings",
    build(repoRoot = paths.repoRoot) {
      return new ShapefileSource({
        sourceId: "ElectionsAlberta/EA_Voting_Area_Boundaries_2023",
        jurisdictionId: "ab-ca-gov",
        effectiveDate: "2023-05-29",
        drawnDate: "2017-12-15",
        boundaryYear: 2023,
        srid: 3400,
        shpPath: join(DATA(repoRoot), "2025", "EA_Voting_Area_Boundaries_2023.shp"),
        fieldMap: { name: "ED_NAME", ref: "ED_NUM" },
        dissolveBy: "ED_NUM",
      });
    },
  },
];

const BY_JURISDICTION: ReadonlyMap<string, readonly BoundarySetMeta[]> = new Map([
  ["ab-ca-gov", AB_CA_GOV_BOUNDARY_SETS],
]);

/** All registered boundary sets for a jurisdiction (empty when none — e.g. oursay-global). */
export function boundarySetsFor(jurisdictionId: string): readonly BoundarySetMeta[] {
  return BY_JURISDICTION.get(jurisdictionId) ?? [];
}

/** Set with the greatest effectiveDate, or undefined when the jurisdiction has no districts. */
export function latestBoundarySet(jurisdictionId: string): BoundarySetMeta | undefined {
  const sets = boundarySetsFor(jurisdictionId);
  if (sets.length === 0) return undefined;
  return [...sets].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
}

/**
 * Resolve a named set or `latest`. Throws when the jurisdiction has no sets or the id is unknown.
 */
export function resolveBoundarySet(
  jurisdictionId: string,
  setId: string = "latest",
): BoundarySetMeta {
  const sets = boundarySetsFor(jurisdictionId);
  if (sets.length === 0) {
    throw new Error(`jurisdiction ${jurisdictionId} has no boundary datasets`);
  }
  if (setId === "latest") {
    return latestBoundarySet(jurisdictionId)!;
  }
  const found = sets.find((s) => s.id === setId);
  if (!found) {
    const ids = sets.map((s) => s.id).join(" | ");
    throw new Error(`Unknown boundary set "${setId}" for ${jurisdictionId} (expected latest | ${ids})`);
  }
  return found;
}
