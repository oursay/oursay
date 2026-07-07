// Load repo-root .env.test before Mocha specs import package config. override: true ensures test
// ports win even when a developer has PGPORT=5442 in api/.env or public-record/.env.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: join(repoRoot, ".env.test"), override: true });
