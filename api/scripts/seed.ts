/**
 * Dev DB seed entry — realistic civic corpus via the real write path.
 *
 * Run: `npm run seed -w @oursay/api` (after `npm run db:up -w @oursay/api`).
 * Requires NODE_ENV=development (set in api/.env for local dev).
 * Content templates live in seed-data/content.ts; authors are assigned at runtime.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { assertDevelopmentOnly } from "../../scripts/destructive-guard.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

assertDevelopmentOnly("api seed");

await import("./seed-run.js");
