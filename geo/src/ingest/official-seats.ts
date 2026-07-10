// Ingest official seat roster from jurisdiction-data working files into geo.official_seats,
// aligned to the boundary set's effective_date and boundary_year.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GLOBAL_PLATFORM_SEAT, seatTitle as sharedSeatTitle } from "@oursay/slugs";
import type { GeoStore, OfficialSeatUpsert } from "../store.js";

export interface OfficialSeatCatalogEntry {
  seatHandle: string;
  seatKind: "jurisdiction_leader" | "district_mla";
  jurisdictionId: string;
  jurisdictionShortSlug: string;
  title?: string;
  name: string;
  role: string;
  leaderRole?: string;
  districtSlug: string | null;
  districtShortSlug: string | null;
  partyName?: string;
  source: string;
  claimedUserHandle?: string | null;
}

export interface OfficialSeatCatalogFile {
  jurisdictionId: string;
  seats: OfficialSeatCatalogEntry[];
}

export interface IngestOfficialSeatsOptions {
  jurisdictionId: string;
  effectiveDate: string;
  boundaryYear: number;
  /** Path to normalized/seats.json (defaults under repo jurisdiction-data). */
  catalogPath?: string;
  /** Extra manual seats merged after the catalog (e.g. platform stewards). */
  extraSeats?: OfficialSeatCatalogEntry[];
}

function seatTitle(entry: OfficialSeatCatalogEntry): string {
  return entry.title ?? sharedSeatTitle(entry);
}

function seatRevisionId(seatHandle: string, boundaryYear: number): string {
  return `${seatHandle}-${boundaryYear}`;
}

function toUpsert(
  entry: OfficialSeatCatalogEntry,
  opts: IngestOfficialSeatsOptions,
): OfficialSeatUpsert {
  return {
    id: seatRevisionId(entry.seatHandle, opts.boundaryYear),
    jurisdictionId: entry.jurisdictionId,
    seatKind: entry.seatKind,
    title: seatTitle(entry),
    seatHandle: entry.seatHandle,
    districtSlug: entry.districtSlug,
    districtShortSlug: entry.districtShortSlug,
    leaderRole: entry.leaderRole ?? null,
    effectiveDate: opts.effectiveDate,
    boundaryYear: opts.boundaryYear,
    role: entry.role,
    representativeName: entry.name,
    claimedUserHandle: entry.claimedUserHandle ?? null,
    source: entry.source,
  };
}

export async function loadOfficialSeatCatalog(catalogPath: string): Promise<OfficialSeatCatalogFile> {
  const raw = JSON.parse(await readFile(catalogPath, "utf8")) as OfficialSeatCatalogFile;
  if (!raw.jurisdictionId || !Array.isArray(raw.seats)) {
    throw new Error(`Invalid official seat catalog: ${catalogPath}`);
  }
  return raw;
}

export async function ingestOfficialSeats(
  store: GeoStore,
  opts: IngestOfficialSeatsOptions,
  repoRoot: string,
): Promise<{ jurisdictionId: string; count: number }> {
  const catalogPath =
    opts.catalogPath ??
    join(
      repoRoot,
      "jurisdiction-data",
      "ab-ca-gov",
      "leaders",
      "opennorth",
      "normalized",
      "seats.json",
    );

  const catalog = await loadOfficialSeatCatalog(catalogPath);
  const entries = [
    ...catalog.seats.filter((seat) => seat.jurisdictionId === opts.jurisdictionId),
    ...(opts.extraSeats ?? []),
  ];

  for (const entry of entries) {
    await store.upsertOfficialSeat(toUpsert(entry, opts));
  }

  return { jurisdictionId: opts.jurisdictionId, count: entries.length };
}

/** Global jurisdiction platform leader seat for oursay-global (manual roster). Identity comes from
 *  the shared {@link GLOBAL_PLATFORM_SEAT} constants; geo adds its ingest-entry-specific fields. */
export function oursayGlobalPlatformSeat(): OfficialSeatCatalogEntry {
  return {
    seatHandle: GLOBAL_PLATFORM_SEAT.seatHandle,
    seatKind: GLOBAL_PLATFORM_SEAT.seatKind,
    jurisdictionId: GLOBAL_PLATFORM_SEAT.jurisdictionId,
    jurisdictionShortSlug: GLOBAL_PLATFORM_SEAT.jurisdictionShortSlug,
    title: GLOBAL_PLATFORM_SEAT.title,
    name: GLOBAL_PLATFORM_SEAT.name,
    role: GLOBAL_PLATFORM_SEAT.role,
    leaderRole: GLOBAL_PLATFORM_SEAT.leaderRole,
    districtSlug: null,
    districtShortSlug: null,
    source: "manual",
    claimedUserHandle: GLOBAL_PLATFORM_SEAT.claimedUserHandle,
  };
}
