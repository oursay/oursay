#!/usr/bin/env node
/**
 * Stop the monorepo production stack without wiping volumes.
 *
 * Usage (from repo root):
 *   node scripts/prod-down.mjs
 *   npm run prod:down
 *
 * Refuses to run when NODE_ENV=production unless OURSAY_ALLOW_PROD_DOWN=1
 * (compose stop is recoverable; still gated to avoid accidental teardown).
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = join(repoRoot, "docker-compose.prod.yml");
const envFile = join(repoRoot, ".env");

/** Minimal .env loader (KEY=VALUE) so we can gate on NODE_ENV without a root dotenv dep. */
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(envFile);

if (process.env.NODE_ENV === "production" && process.env.OURSAY_ALLOW_PROD_DOWN !== "1") {
  console.error(
    "[prod-down] Refusing: NODE_ENV=production. Set OURSAY_ALLOW_PROD_DOWN=1 to stop the stack " +
      "(volumes are kept; this does not run `down -v`).",
  );
  process.exit(1);
}

const args = ["compose", "-f", composeFile, "-p", "oursay", "down", "--remove-orphans"];
console.log("[prod-down] docker", args.join(" "));
const result = spawnSync("docker", args, {
  cwd: repoRoot,
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
