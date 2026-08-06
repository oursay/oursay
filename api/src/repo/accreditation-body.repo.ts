// Data access for auth.accreditation_bodies ([v1-media-accreditation-bodies]): platform catalog of
// press-credential issuers. Admin-maintained; referenced by future media_accreditations and by
// JurisdictionConfig.recognizedAccreditationBodyIds (ids only — never free-text names).

import type pg from "pg";
import { ServiceError } from "../errors.js";

export type AccreditationBodyStatus = "active" | "retired";

export interface AccreditationBodyRecord {
  id: string;
  name: string;
  status: AccreditationBodyStatus;
  createdAt: string;
  updatedAt: string;
}

/** Stable catalog ids: lowercase slug segments joined by hyphens (e.g. ca-caj-example). */
const ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function assertAccreditationBodyId(id: string): string {
  const trimmed = id.trim();
  if (!ID_RE.test(trimmed)) {
    throw new ServiceError(
      "validation",
      `invalid accreditation body id "${id}" (expected lowercase slug, e.g. ca-caj-example)`,
    );
  }
  return trimmed;
}

export function assertAccreditationBodyName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ServiceError("validation", "accreditation body name must be non-empty");
  }
  if (trimmed.length > 200) {
    throw new ServiceError("validation", "accreditation body name must be ≤ 200 characters");
  }
  return trimmed;
}

export class AccreditationBodyRepo {
  constructor(private readonly pool: pg.Pool) {}

  async getById(id: string): Promise<AccreditationBodyRecord | null> {
    const { rows } = await this.pool.query(`SELECT * FROM auth.accreditation_bodies WHERE id = $1`, [
      id,
    ]);
    return rows[0] ? map(rows[0]) : null;
  }

  async list(status: AccreditationBodyStatus | "all" = "active"): Promise<AccreditationBodyRecord[]> {
    const { rows } =
      status === "all"
        ? await this.pool.query(
            `SELECT * FROM auth.accreditation_bodies ORDER BY status, name, id`,
          )
        : await this.pool.query(
            `SELECT * FROM auth.accreditation_bodies WHERE status = $1 ORDER BY name, id`,
            [status],
          );
    return rows.map(map);
  }

  /** Create a new active catalog entry. Refuses duplicate ids. */
  async create(id: string, name: string): Promise<AccreditationBodyRecord> {
    const bodyId = assertAccreditationBodyId(id);
    const bodyName = assertAccreditationBodyName(name);
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO auth.accreditation_bodies(id, name, status)
         VALUES($1,$2,'active')
         RETURNING *`,
        [bodyId, bodyName],
      );
      return map(rows[0]);
    } catch (err: any) {
      if (err?.code === "23505") {
        throw new ServiceError("conflict", `accreditation body already exists: ${bodyId}`);
      }
      throw err;
    }
  }

  /** Rename an existing body (any status). */
  async updateName(id: string, name: string): Promise<AccreditationBodyRecord> {
    const bodyId = assertAccreditationBodyId(id);
    const bodyName = assertAccreditationBodyName(name);
    const { rows } = await this.pool.query(
      `UPDATE auth.accreditation_bodies
       SET name = $2, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [bodyId, bodyName],
    );
    if (!rows[0]) {
      throw new ServiceError("not_found", `accreditation body not found: ${bodyId}`);
    }
    return map(rows[0]);
  }

  /** Retire a body (idempotent when already retired). Retired bodies stay referencable. */
  async retire(id: string): Promise<AccreditationBodyRecord> {
    return this.setStatus(id, "retired");
  }

  /** Reactivate a retired body (ops undo). Idempotent when already active. */
  async activate(id: string): Promise<AccreditationBodyRecord> {
    return this.setStatus(id, "active");
  }

  private async setStatus(
    id: string,
    status: AccreditationBodyStatus,
  ): Promise<AccreditationBodyRecord> {
    const bodyId = assertAccreditationBodyId(id);
    const { rows } = await this.pool.query(
      `UPDATE auth.accreditation_bodies
       SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [bodyId, status],
    );
    if (!rows[0]) {
      throw new ServiceError("not_found", `accreditation body not found: ${bodyId}`);
    }
    return map(rows[0]);
  }
}

function map(r: any): AccreditationBodyRecord {
  return {
    id: r.id,
    name: r.name,
    status: r.status as AccreditationBodyStatus,
    createdAt: r.created_at.toISOString?.() ?? String(r.created_at),
    updatedAt: r.updated_at.toISOString?.() ?? String(r.updated_at),
  };
}
