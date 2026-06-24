// Config for @oursay/geo. The geo schema lives in the SAME Postgres @oursay/public-record uses
// (the PostGIS image), so the connection config mirrors public-record's `pgConfig` env pattern —
// load repo-root .env first, then the package-local .env (local overrides root). No geo-specific
// secrets; ingest paths are the only optional overrides.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");

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

/** The shared Postgres/PostGIS store (same instance as public-record's private store). */
export const pgConfig: PgConfig = {
  host: env("PGHOST", "127.0.0.1"),
  port: Number(env("PGPORT", "5442")),
  user: env("PGUSER", "oursay"),
  password: env("PGPASSWORD", "oursay"),
  database: env("PGDATABASE", "oursay_public_record"),
};

export const paths = { packageRoot, repoRoot };
