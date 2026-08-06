import type pg from "pg";
import type { JurisdictionConfig } from "@oursay/public-record";

export interface JurisdictionConfigProjection {
  config: JurisdictionConfig;
  sourceEntityId: string;
  sourceTxId: string;
  sourceTxHash: string;
}

export class JurisdictionConfigRepo {
  constructor(private readonly pool: pg.Pool) {}

  async list(): Promise<JurisdictionConfigProjection[]> {
    let result: pg.QueryResult;
    try {
      result = await this.pool.query(
        `SELECT config, source_entity_id, source_tx_id, source_tx_hash
           FROM jurisdiction_configs
          ORDER BY jurisdiction_id`,
      );
    } catch (err) {
      // OpenAPI generation builds the service graph without running Db.init().
      if ((err as { code?: string }).code === "42P01") return [];
      throw err;
    }
    return result.rows.map((row) => ({
      config: row.config as JurisdictionConfig,
      sourceEntityId: String(row.source_entity_id),
      sourceTxId: String(row.source_tx_id),
      sourceTxHash: String(row.source_tx_hash),
    }));
  }

  async upsert(
    projection: JurisdictionConfigProjection,
    client?: pg.PoolClient,
  ): Promise<void> {
    const queryable = client ?? this.pool;
    await queryable.query(
      `INSERT INTO jurisdiction_configs
         (jurisdiction_id, config, source_entity_id, source_tx_id, source_tx_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (jurisdiction_id) DO UPDATE SET
         config = EXCLUDED.config,
         source_entity_id = EXCLUDED.source_entity_id,
         source_tx_id = EXCLUDED.source_tx_id,
         source_tx_hash = EXCLUDED.source_tx_hash,
         updated_at = now()`,
      [
        projection.config.id,
        JSON.stringify(projection.config),
        projection.sourceEntityId,
        projection.sourceTxId,
        projection.sourceTxHash,
      ],
    );
  }
}
