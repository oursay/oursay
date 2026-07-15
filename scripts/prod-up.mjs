#!/usr/bin/env node
/**
 * Bring up the monorepo production stack (docker-compose.prod.yml) and wait
 * for healthchecks before returning.
 *
 * Usage (from repo root):
 *   node scripts/prod-up.mjs
 *   npm run prod:up
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = join(repoRoot, "docker-compose.prod.yml");
const envFile = join(repoRoot, ".env");

if (!existsSync(composeFile)) {
  console.error("[prod-up] missing docker-compose.prod.yml at repo root");
  process.exit(1);
}

const args = ["compose", "-f", composeFile, "-p", "oursay"];
if (existsSync(envFile)) {
  args.push("--env-file", envFile);
}
args.push("up", "-d", "--build", "--wait", "--remove-orphans");

console.log("[prod-up] docker", args.join(" "));
const result = spawnSync("docker", args, {
  cwd: repoRoot,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "production" },
});
process.exit(result.status ?? 1);
