/**
 * Dev stack: bring up API (+ public-record DBs/worker via compose), then run the
 * web-app against it with NEXT_PUBLIC_MOCK_ONLY=0.
 *
 * Usage (from repo root): npm run up -w @oursay/web-app
 */
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");

const up = spawnSync("npm", ["run", "up", "-w", "@oursay/api"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: true,
});
if ((up.status ?? 1) !== 0) {
  process.exit(up.status ?? 1);
}

process.env.NEXT_PUBLIC_MOCK_ONLY = "0";
if (!process.env.OURSAY_API_URL) {
  process.env.OURSAY_API_URL = "http://localhost:8080";
}

console.log("[web-app] API stack is up — starting Next in live mode (NEXT_PUBLIC_MOCK_ONLY=0)");
console.log("[web-app] http://localhost:3000  ·  API http://localhost:8080/docs");

const next = spawn("npm", ["run", "dev"], {
  cwd: packageRoot,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

next.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
