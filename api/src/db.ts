// Database access for @oursay/api: one pg.Pool over the SAME Postgres @oursay/public-record uses,
// plus schema bootstrap and a guarded test reset.
//
// Init order matters: `auth.profiles.user_id` FKs `public.users(id)` and recovery reads
// `public.kyc_attestations`, so we apply public-record's base schema (via PrivateStore.init) BEFORE
// the `auth` schema. PrivateStore.init() is idempotent (CREATE TABLE IF NOT EXISTS) and is the DRY
// way to guarantee those tables exist without copying their DDL here.

import pg from "pg";
import { GeoStore } from "@oursay/geo";
import { PrivateStore } from "@oursay/public-record";
import { assertDestructiveAllowed } from "../../scripts/destructive-guard.js";
import { pgConfig } from "./config.js";
import { AUTH_DDL } from "./schema/auth.sql.js";

export class Db {
  readonly pool: pg.Pool;

  constructor(cfg = pgConfig) {
    this.pool = new pg.Pool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      max: 8,
    });
  }

  /** Ensure public-record's base schema (users, kyc_attestations, …), the `geo` schema (PostGIS
   *  district boundaries + regions), then the `auth` schema. All three are idempotent. */
  async init(): Promise<void> {
    const base = new PrivateStore(pgConfig);
    await base.init();
    const geo = new GeoStore(pgConfig);
    await geo.init();
    await geo.close();
    await this.pool.query(AUTH_DDL);
  }

  /** Wipe auth + account rows for test isolation. Guarded: refuses under NODE_ENV=production.
   *  `public.users CASCADE` also clears the civic identity tables that FK it (device_keys,
   *  thread_keys/bindings/signers, kyc/nullifier attestations); the record pool (record_tx /
   *  record_outbox) has no FK to users, so it's truncated explicitly. */
  async reset(): Promise<void> {
    assertDestructiveAllowed("Db.reset()");
    await this.pool.query(
      `TRUNCATE auth.otp_rate_limits, auth.email_otp, auth.sessions, auth.webauthn_challenges,
               auth.passkey_credentials, auth.profile_geocode_history, auth.profile_geocodes, auth.profiles,
               geo.regions, geo.districts,
               public.record_outbox, public.record_tx, public.users CASCADE`,
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
