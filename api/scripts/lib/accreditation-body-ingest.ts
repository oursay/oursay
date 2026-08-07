/**
 * Sync packaged accreditation bodies into auth.accreditation_bodies, then apply the packaged
 * JurisdictionConfig (recognizedAccreditationBodyIds) via jurisdiction_config_set.
 *
 * Default: fail closed on unknown catalog ids. Pass addBodies (CLI --add-bodies / --force)
 * to create missing rows and rename drifted names.
 */

import {
  accreditationBodiesFor,
  jurisdictions,
  type PackagedAccreditationBody,
} from "@oursay/jurisdiction-data";
import type { Services } from "../../src/container.js";
import type { EnsuredOpsAccount } from "../../src/helpers/ops-account.js";
import {
  assertAccreditationBodyId,
  assertAccreditationBodyName,
} from "../../src/repo/accreditation-body.repo.js";
import { applyJurisdictionConfigs, type LogFn } from "./audited-ingest.js";

export interface AccreditationBodyIngestResult {
  created: number;
  activated: number;
  renamed: number;
  skipped: number;
  warnings: string[];
}

export interface IngestAccreditationBodiesInput {
  jurisdictionId: string;
  /** Create missing catalog rows and update drifted names (--add-bodies / --force). */
  addBodies: boolean;
  grantedByAdminId?: string | null;
  log?: LogFn;
  /** Stdout audit sink (defaults to console.log JSON). */
  auditLog?: (payload: Record<string, unknown>) => void;
}

function defaultAuditLog(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ role: "accreditation_body", ...payload }));
}

function unknownBodyMessage(body: PackagedAccreditationBody): string {
  return (
    `Media Accreditation Body '${body.id}' ('${body.name}') not in catalog; ` +
    `ensure it's spelled correctly or use --add-bodies or --force to add unknown bodies to the catalog`
  );
}

/**
 * Ensure packaged bodies exist in the platform catalog, then replace jurisdiction recognition
 * via the packaged JurisdictionConfig (jurisdiction_config_set).
 */
export async function ingestAccreditationBodiesForJurisdiction(
  services: Services,
  ops: EnsuredOpsAccount,
  input: IngestAccreditationBodiesInput,
): Promise<AccreditationBodyIngestResult> {
  const log = input.log ?? console.log;
  const auditLog = input.auditLog ?? defaultAuditLog;
  const grantedBy = input.grantedByAdminId ?? null;
  const packaged = accreditationBodiesFor(input.jurisdictionId);
  const result: AccreditationBodyIngestResult = {
    created: 0,
    activated: 0,
    renamed: 0,
    skipped: 0,
    warnings: [],
  };

  if (packaged.length === 0) {
    log(
      `accreditation bodies: no packaged list for ${input.jurisdictionId} — catalog sync skipped`,
    );
  } else {
    const missing: PackagedAccreditationBody[] = [];
    const repo = services.repos.accreditationBody;

    for (const body of packaged) {
      const id = assertAccreditationBodyId(body.id);
      const name = assertAccreditationBodyName(body.name);
      const existing = await repo.getById(id);

      if (!existing) {
        if (!input.addBodies) {
          missing.push({ id, name });
          continue;
        }
        const created = await repo.create(id, name);
        auditLog({
          action: "create",
          id: created.id,
          name: created.name,
          status: created.status,
          granted_by_admin_id: grantedBy,
          at: new Date().toISOString(),
        });
        log(`accreditation bodies: created ${created.id} (${created.name})`);
        result.created++;
        continue;
      }

      let touched = false;

      if (existing.name !== name) {
        if (input.addBodies) {
          const updated = await repo.updateName(id, name);
          auditLog({
            action: "update",
            id: updated.id,
            name: updated.name,
            status: updated.status,
            granted_by_admin_id: grantedBy,
            at: new Date().toISOString(),
          });
          log(
            `accreditation bodies: renamed ${id} ${JSON.stringify(existing.name)} → ${JSON.stringify(updated.name)}`,
          );
          result.renamed++;
          touched = true;
        } else {
          const warn =
            `accreditation bodies: name drift for ${id}: catalog=${JSON.stringify(existing.name)} ` +
            `packaged=${JSON.stringify(name)} (keeping catalog name; pass --add-bodies or --force to update)`;
          result.warnings.push(warn);
          log(warn);
        }
      }

      if (existing.status === "retired") {
        const activated = await repo.activate(id);
        auditLog({
          action: "activate",
          id: activated.id,
          name: activated.name,
          status: activated.status,
          granted_by_admin_id: grantedBy,
          at: new Date().toISOString(),
        });
        log(`accreditation bodies: activated ${activated.id}`);
        result.activated++;
        touched = true;
      }

      if (!touched && existing.name === name && existing.status === "active") {
        result.skipped++;
      }
    }

    if (missing.length > 0) {
      throw new Error(unknownBodyMessage(missing[0]!));
    }

    log(
      `accreditation bodies: ${result.created} created, ${result.renamed} renamed, ` +
        `${result.activated} activated, ${result.skipped} unchanged ` +
        `(${input.jurisdictionId})`,
    );
  }

  const config = jurisdictions.find((j) => j.id === input.jurisdictionId);
  if (!config) {
    throw new Error(
      `unknown jurisdiction "${input.jurisdictionId}" (packaged: ${jurisdictions.map((j) => j.id).join(", ")})`,
    );
  }
  await applyJurisdictionConfigs(services, ops, [config], log);
  return result;
}
