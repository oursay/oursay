/**
 * `docker compose up` for public-record stacks, optionally enabling the settlement worker.
 *
 * When AUTO_START_WORKER is 1/true/yes (env or package/repo .env), the compose `worker` profile
 * is enabled so the settlement worker container starts with Postgres + immudb.
 *
 * Usage (from public-record/):
 *   tsx scripts/compose-up.ts <project-name> <compose-file>
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");

dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

function truthy(v: string | undefined): boolean {
  return /^(1|true|yes)$/i.test((v ?? "").trim());
}

const project = process.argv[2];
const composeFile = process.argv[3];
if (!project || !composeFile) {
  console.error("usage: tsx scripts/compose-up.ts <project-name> <compose-file>");
  process.exit(2);
}

const autoWorker = truthy(process.env.AUTO_START_WORKER);
const args = ["compose", "-p", project, "-f", composeFile];
if (autoWorker) {
  args.push("--profile", "worker");
  console.log("[compose-up] AUTO_START_WORKER set — enabling compose profile `worker`");
}
args.push("up", "-d", "--wait");

const result = spawnSync("docker", args, { cwd: packageRoot, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
