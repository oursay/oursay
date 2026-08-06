/**
 * Shared signed ingest helpers for seed + admin CLIs.
 * Materialize via @oursay/geo; submit via PlatformOpsService (idempotent when unchanged).
 */

import {
  materializeDistricts,
  materializeOfficialSeats,
  oursayGlobalPlatformSeat,
  paths,
  type BoundarySource,
  type IngestOfficialSeatsOptions,
} from "@oursay/geo";
import {
  canonicalJson,
  sha256Hex,
  type JurisdictionConfig,
} from "@oursay/public-record";
import type { Services } from "../../src/container.js";
import type { EnsuredOpsAccount } from "../../src/helpers/ops-account.js";

export interface AuditedIngestCounts {
  changed: number;
  skipped: number;
  total: number;
  txIds: string[];
}

export interface LogFn {
  (message: string): void;
}

function emptyCounts(): AuditedIngestCounts {
  return { changed: 0, skipped: 0, total: 0, txIds: [] };
}

async function submit(
  services: Services,
  ops: EnsuredOpsAccount,
  kind: "jurisdiction_config_set" | "district_upsert" | "official_seat_upsert",
  jurisdictionId: string,
  payload: Record<string, unknown>,
  counts: AuditedIngestCounts,
): Promise<void> {
  counts.total++;
  const result = await services.platformOpsService.submitWithOpsSoftKeyIfChanged({
    opsUserId: ops.userId,
    kind,
    jurisdictionId,
    payload,
    opsPrivKeyHex: ops.privKeyHex,
  });
  if (result.changed && result.ref) {
    counts.changed++;
    counts.txIds.push(result.ref.txId);
  } else {
    counts.skipped++;
  }
}

/** Apply one or more packaged jurisdiction configs as jurisdiction_config_set ops. */
export async function applyJurisdictionConfigs(
  services: Services,
  ops: EnsuredOpsAccount,
  configs: JurisdictionConfig[],
  log: LogFn = console.log,
): Promise<AuditedIngestCounts> {
  const counts = emptyCounts();
  for (const config of configs) {
    await submit(services, ops, "jurisdiction_config_set", config.id, { config }, counts);
  }
  log(
    `jurisdiction config: ${counts.changed} changed, ${counts.skipped} unchanged ` +
      `(${configs.map((c) => c.id).join(", ")})`,
  );
  return counts;
}

/** Materialize a BoundarySource and submit one district_upsert per district. */
export async function applyDistrictSource(
  services: Services,
  ops: EnsuredOpsAccount,
  source: BoundarySource,
  log: LogFn = console.log,
): Promise<AuditedIngestCounts> {
  const counts = emptyCounts();
  log(
    `districts: materializing ${source.jurisdictionId} ` +
      `(year ${source.boundaryYear}, effective ${source.effectiveDate})…`,
  );
  const districts = await materializeDistricts(services.geoStore, source);
  for (const district of districts) {
    const geometrySha256 = sha256Hex(canonicalJson(district.geometryGeoJSON));
    await submit(
      services,
      ops,
      "district_upsert",
      district.jurisdictionId,
      { district: { ...district, geometrySha256 } },
      counts,
    );
  }
  log(`districts: ${counts.changed} changed, ${counts.skipped} unchanged (${counts.total} total)`);
  return counts;
}

/** Materialize official seats and submit one official_seat_upsert per seat. */
export async function applyOfficialSeats(
  services: Services,
  ops: EnsuredOpsAccount,
  opts: IngestOfficialSeatsOptions,
  log: LogFn = console.log,
  repoRoot: string = paths.repoRoot,
): Promise<AuditedIngestCounts> {
  const counts = emptyCounts();
  const seats = await materializeOfficialSeats(opts, repoRoot);
  for (const seat of seats) {
    await submit(services, ops, "official_seat_upsert", seat.jurisdictionId, { seat }, counts);
  }
  log(
    `official seats (${opts.jurisdictionId}): ${counts.changed} changed, ` +
      `${counts.skipped} unchanged (${counts.total} total)`,
  );
  return counts;
}

/**
 * Ingest AB seats for a boundary set, plus the oursay-global platform steward aligned to the same dates.
 */
export async function applyBoundaryAlignedSeats(
  services: Services,
  ops: EnsuredOpsAccount,
  input: {
    jurisdictionId: string;
    effectiveDate: string;
    boundaryYear: number;
    /** Also ingest oursay-global steward seat (default true for ab-ca-gov stand-up / geo redirect). */
    includeGlobalSteward?: boolean;
  },
  log: LogFn = console.log,
  repoRoot: string = paths.repoRoot,
): Promise<{ primary: AuditedIngestCounts; global?: AuditedIngestCounts }> {
  const primary = await applyOfficialSeats(
    services,
    ops,
    {
      jurisdictionId: input.jurisdictionId,
      effectiveDate: input.effectiveDate,
      boundaryYear: input.boundaryYear,
      ...(input.jurisdictionId === "oursay-global"
        ? { extraSeats: [oursayGlobalPlatformSeat()] }
        : {}),
    },
    log,
    repoRoot,
  );

  const includeGlobal =
    input.includeGlobalSteward ?? (input.jurisdictionId === "ab-ca-gov");
  if (!includeGlobal || input.jurisdictionId === "oursay-global") {
    return { primary };
  }

  const global = await applyOfficialSeats(
    services,
    ops,
    {
      jurisdictionId: "oursay-global",
      effectiveDate: input.effectiveDate,
      boundaryYear: input.boundaryYear,
      extraSeats: [oursayGlobalPlatformSeat()],
    },
    log,
    repoRoot,
  );
  return { primary, global };
}

/** Seed/dev convenience: all packaged configs + one Alberta boundary set + aligned seats. */
export async function ingestAuditedJurisdictionData(
  services: Services,
  ops: EnsuredOpsAccount,
  input: {
    configs: JurisdictionConfig[];
    districtSource: BoundarySource;
    log?: LogFn;
  },
): Promise<void> {
  const log = input.log ?? console.log;
  await applyJurisdictionConfigs(services, ops, input.configs, log);
  await applyDistrictSource(services, ops, input.districtSource, log);
  await applyBoundaryAlignedSeats(
    services,
    ops,
    {
      jurisdictionId: input.districtSource.jurisdictionId,
      effectiveDate: input.districtSource.effectiveDate,
      boundaryYear: input.districtSource.boundaryYear,
      includeGlobalSteward: true,
    },
    log,
  );
}

export interface JurisdictionAuditSummary {
  jurisdictionId: string;
  config: {
    present: boolean;
    sourceTxId: string | null;
    sourceTxHash: string | null;
  };
  districts: { total: number; withAuditLink: number };
  seats: { total: number; withAuditLink: number };
  pendingOutbox: number;
}

/** Read-only check that projections for a jurisdiction are linked to platform-ops txs. */
export async function verifyJurisdictionAudit(
  services: Services,
  jurisdictionId: string,
): Promise<JurisdictionAuditSummary> {
  const projections = await services.repos.jurisdictionConfig.list();
  const configRow = projections.find((p: { config: { id: string } }) => p.config.id === jurisdictionId);

  const districtStats = await services.db.pool.query<{ total: string; linked: string }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE source_tx_id IS NOT NULL)::text AS linked
       FROM geo.districts
      WHERE jurisdiction_id = $1`,
    [jurisdictionId],
  );
  const seatStats = await services.db.pool.query<{ total: string; linked: string }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE source_tx_id IS NOT NULL)::text AS linked
       FROM geo.official_seats
      WHERE jurisdiction_id = $1`,
    [jurisdictionId],
  );
  const pending = await services.db.pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM record_outbox WHERE chain_id = $1 AND status = 'pending'`,
    [jurisdictionId],
  );

  return {
    jurisdictionId,
    config: {
      present: Boolean(configRow),
      sourceTxId: configRow?.sourceTxId ?? null,
      sourceTxHash: configRow?.sourceTxHash ?? null,
    },
    districts: {
      total: Number(districtStats.rows[0]?.total ?? 0),
      withAuditLink: Number(districtStats.rows[0]?.linked ?? 0),
    },
    seats: {
      total: Number(seatStats.rows[0]?.total ?? 0),
      withAuditLink: Number(seatStats.rows[0]?.linked ?? 0),
    },
    pendingOutbox: Number(pending.rows[0]?.n ?? 0),
  };
}

export function printJurisdictionAuditSummary(
  summary: JurisdictionAuditSummary,
  log: LogFn = console.log,
): void {
  log(JSON.stringify({ action: "verify", ...summary }, null, 2));
  log(
    `verify ${summary.jurisdictionId}: config=${summary.config.present ? "ok" : "MISSING"} ` +
      `districts=${summary.districts.withAuditLink}/${summary.districts.total} linked ` +
      `seats=${summary.seats.withAuditLink}/${summary.seats.total} linked ` +
      `pendingOutbox=${summary.pendingOutbox}`,
  );
}
