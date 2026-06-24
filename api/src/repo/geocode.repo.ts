// Data access for the private geocode point cache (auth.profile_geocodes) and its append-only audit
// (auth.profile_geocode_history). PRIVATE PII — coordinates returned here (lon/lat via ST_X/ST_Y) are
// for internal service/test use ONLY and must never be surfaced on an HTTP response, OpenAPI schema, or
// log. `profile_geocodes` holds at most one CURRENT row per user; `profile_geocode_history` is
// append-only (one row per distinct address the user has resolved to) and is never deleted here.

import type pg from "pg";

export interface GeocodeUpsert {
  userId: string;
  addressHash: string;
  lon: number;
  lat: number;
  provider: string;
  confidence: number | null;
}

export interface CurrentGeocode {
  addressHash: string;
  provider: string;
  confidence: number | null;
  geocodedAt: string;
  lon: number;
  lat: number;
}

export interface HistoryGeocode {
  addressHash: string;
  provider: string;
  confidence: number | null;
  recordedAt: string;
  lon: number;
  lat: number;
}

export class GeocodeRepo {
  constructor(private readonly pool: pg.Pool) {}

  /** Write/replace the user's CURRENT point. */
  async upsertCurrent(g: GeocodeUpsert): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.profile_geocodes (user_id, address_hash, geom, provider, confidence)
       VALUES ($1, $2, ST_SetSRID(ST_Point($3, $4), 4326), $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         address_hash = EXCLUDED.address_hash,
         geom         = EXCLUDED.geom,
         provider     = EXCLUDED.provider,
         confidence   = EXCLUDED.confidence,
         geocoded_at  = now()`,
      [g.userId, g.addressHash, g.lon, g.lat, g.provider, g.confidence],
    );
  }

  /** Append to history iff this (user, address_hash) is new; otherwise a no-op. */
  async appendHistory(g: GeocodeUpsert): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.profile_geocode_history (user_id, address_hash, geom, provider, confidence)
       VALUES ($1, $2, ST_SetSRID(ST_Point($3, $4), 4326), $5, $6)
       ON CONFLICT (user_id, address_hash) DO NOTHING`,
      [g.userId, g.addressHash, g.lon, g.lat, g.provider, g.confidence],
    );
  }

  /** The user's CURRENT point (internal/test use only — never returned over HTTP). */
  async getCurrent(userId: string): Promise<CurrentGeocode | null> {
    const { rows } = await this.pool.query(
      `SELECT address_hash, provider, confidence, geocoded_at,
              ST_X(geom) AS lon, ST_Y(geom) AS lat
       FROM auth.profile_geocodes WHERE user_id = $1`,
      [userId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      addressHash: r.address_hash,
      provider: r.provider,
      confidence: r.confidence === null ? null : Number(r.confidence),
      geocodedAt: r.geocoded_at.toISOString?.() ?? String(r.geocoded_at),
      lon: Number(r.lon),
      lat: Number(r.lat),
    };
  }

  /** Clear ONLY the current row (history is never touched). Idempotent. */
  async clearCurrent(userId: string): Promise<void> {
    await this.pool.query(`DELETE FROM auth.profile_geocodes WHERE user_id = $1`, [userId]);
  }

  /** Full geocode history for a user, newest first (internal/test use; the future "ever in region"
   *  consumer). Never returned over HTTP. */
  async historyForUser(userId: string): Promise<HistoryGeocode[]> {
    const { rows } = await this.pool.query(
      `SELECT address_hash, provider, confidence, recorded_at,
              ST_X(geom) AS lon, ST_Y(geom) AS lat
       FROM auth.profile_geocode_history WHERE user_id = $1
       ORDER BY recorded_at DESC`,
      [userId],
    );
    return rows.map((r) => ({
      addressHash: r.address_hash,
      provider: r.provider,
      confidence: r.confidence === null ? null : Number(r.confidence),
      recordedAt: r.recorded_at.toISOString?.() ?? String(r.recorded_at),
      lon: Number(r.lon),
      lat: Number(r.lat),
    }));
  }
}
