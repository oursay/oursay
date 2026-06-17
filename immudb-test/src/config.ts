import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");

// Load repo-root .env first, then package-local .env (local overrides root).
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

function env(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

export interface ImmudbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** Where immudb-node persists its trusted-state file. */
  rootPath: string;
}

export interface PgConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export const immudbConfig: ImmudbConfig = {
  host: env("IMMUDB_HOST", "127.0.0.1"),
  port: Number(env("IMMUDB_PORT", "3322")),
  user: env("IMMUDB_USER", "immudb"),
  password: env("IMMUDB_PASSWORD", "immudb"),
  database: env("IMMUDB_DATABASE", "defaultdb"),
  rootPath: join(packageRoot, ".state", "immudb-root"),
};

export const pgConfig: PgConfig = {
  host: env("PGHOST", "127.0.0.1"),
  port: Number(env("PGPORT", "5432")),
  user: env("PGUSER", "oursay"),
  password: env("PGPASSWORD", "oursay"),
  database: env("PGDATABASE", "oursay_private"),
};

/**
 * immudb 1.11.0 reached over its PostgreSQL wire protocol (the "reach up to the latest
 * server" path). Same default immudb credentials, but spoken as Postgres.
 */
export const immudbPgConfig: PgConfig = {
  host: env("IMMUDB_PG_HOST", "127.0.0.1"),
  port: Number(env("IMMUDB_PG_PORT", "5433")),
  user: env("IMMUDB_PG_USER", "immudb"),
  password: env("IMMUDB_PG_PASSWORD", "immudb"),
  database: env("IMMUDB_PG_DATABASE", "defaultdb"),
};

/** Named docker volume holding immudb data (used by the @physical tamper test). */
export const immudbDataVolume = env("IMMUDB_DATA_VOLUME", "oursay_immudb_test_data");

/** Optional EVM anchor signer key; empty => tests generate an ephemeral key. */
export const anchorSignerPrivKey = process.env.ANCHOR_SIGNER_PRIVKEY?.trim() || "";

export const paths = { packageRoot, repoRoot, stateDir: join(packageRoot, ".state"), outDir: join(packageRoot, "out") };
