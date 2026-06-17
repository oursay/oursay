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

export interface PgConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** immudb 1.11.0 reached over its PostgreSQL wire protocol — the public append-only chain. */
export const immudbPgConfig: PgConfig = {
  host: env("IMMUDB_PG_HOST", "127.0.0.1"),
  port: Number(env("IMMUDB_PG_PORT", "5443")),
  user: env("IMMUDB_PG_USER", "immudb"),
  password: env("IMMUDB_PG_PASSWORD", "immudb"),
  database: env("IMMUDB_PG_DATABASE", "defaultdb"),
};

/** Postgres — the private, mutable store (record_tx event log + raw content). */
export const pgConfig: PgConfig = {
  host: env("PGHOST", "127.0.0.1"),
  port: Number(env("PGPORT", "5442")),
  user: env("PGUSER", "oursay"),
  password: env("PGPASSWORD", "oursay"),
  database: env("PGDATABASE", "oursay_public_record"),
};

export const paths = { packageRoot, repoRoot };
