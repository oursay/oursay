/**
 * Create / update / retire / list platform accreditation-body catalog entries.
 *
 *   npm run admin:accreditation-body -w @oursay/api -- create   <id> <name>
 *   npm run admin:accreditation-body -w @oursay/api -- update   <id> --name <name>
 *   npm run admin:accreditation-body -w @oursay/api -- retire   <id>
 *   npm run admin:accreditation-body -w @oursay/api -- activate <id>
 *   npm run admin:accreditation-body -w @oursay/api -- list [--status active|retired|all]
 *
 * Development (NODE_ENV=development) always allowed.
 * Production requires OURSAY_ALLOW_PROD_ADMIN=1 (SSH on the deploy host only).
 *
 * Optional actor for audit: --granted-by <userId> or OURSAY_ADMIN_ACTOR_ID.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildServices } from "../src/container.js";
import { Db } from "../src/db.js";
import { isServiceError } from "../src/errors.js";
import type { AccreditationBodyStatus } from "../src/repo/accreditation-body.repo.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

const USAGE =
  "usage: admin-accreditation-body <create|update|retire|activate|list> …\n" +
  "  create   <id> <name>\n" +
  "  update   <id> --name <name>\n" +
  "  retire   <id>\n" +
  "  activate <id>\n" +
  "  list [--status active|retired|all]\n" +
  "  prod: set OURSAY_ALLOW_PROD_ADMIN=1\n" +
  "  audit actor: --granted-by <userId> or OURSAY_ADMIN_ACTOR_ID";

function assertAdminCliAllowed(): void {
  if (process.env.NODE_ENV === "development") return;
  if (process.env.NODE_ENV === "production" && process.env.OURSAY_ALLOW_PROD_ADMIN === "1") return;
  const env = process.env.NODE_ENV ?? "(unset)";
  throw new Error(
    `Refusing admin-accreditation-body: NODE_ENV must be "development", or "production" with OURSAY_ALLOW_PROD_ADMIN=1 (got NODE_ENV=${env}).`,
  );
}

function parseArgs(argv: string[]): {
  cmd: string | undefined;
  positional: string[];
  grantedBy: string | null;
  nameOpt: string | undefined;
  status: AccreditationBodyStatus | "all";
} {
  const args = argv.filter((a) => a !== "--");
  let grantedBy: string | null = process.env.OURSAY_ADMIN_ACTOR_ID?.trim() || null;
  let nameOpt: string | undefined;
  let status: AccreditationBodyStatus | "all" = "active";
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--granted-by") {
      grantedBy = args[++i]?.trim() || null;
      continue;
    }
    if (a === "--name") {
      nameOpt = args[++i];
      continue;
    }
    if (a === "--status") {
      const raw = args[++i]?.trim();
      if (raw !== "active" && raw !== "retired" && raw !== "all") {
        throw new Error(`invalid --status ${raw ?? "(missing)"} (expected active|retired|all)`);
      }
      status = raw;
      continue;
    }
    if (a.startsWith("-")) continue;
    positional.push(a);
  }
  return { cmd: positional[0], positional: positional.slice(1), grantedBy, nameOpt, status };
}

function auditLog(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ role: "accreditation_body", ...payload }));
}

async function main(): Promise<void> {
  assertAdminCliAllowed();
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[admin-accreditation-body] ${err instanceof Error ? err.message : err}`);
    console.error(USAGE);
    process.exit(2);
  }
  const { cmd, positional, grantedBy, nameOpt, status } = parsed;
  if (!cmd || !["create", "update", "retire", "activate", "list"].includes(cmd)) {
    console.error(USAGE);
    process.exit(2);
  }

  const db = new Db();
  await db.init();
  try {
    const services = await buildServices(db);
    const repo = services.repos.accreditationBody;

    if (grantedBy) {
      const actor = await services.repos.user.getById(grantedBy);
      if (!actor) {
        console.error(`[admin-accreditation-body] --granted-by user not found: ${grantedBy}`);
        process.exit(1);
      }
    }

    if (cmd === "list") {
      const bodies = await repo.list(status);
      for (const b of bodies) {
        console.log(
          JSON.stringify({
            action: "list",
            id: b.id,
            name: b.name,
            status: b.status,
            created_at: b.createdAt,
            updated_at: b.updatedAt,
            at: new Date().toISOString(),
          }),
        );
      }
      console.error(`[admin-accreditation-body] ${bodies.length} body(ies) (status=${status})`);
      return;
    }

    const id = positional[0];
    if (!id) {
      console.error(USAGE);
      process.exit(2);
    }

    if (cmd === "create") {
      const name = positional.slice(1).join(" ").trim() || nameOpt;
      if (!name) {
        console.error(USAGE);
        process.exit(2);
      }
      const body = await repo.create(id, name);
      auditLog({
        action: "create",
        id: body.id,
        name: body.name,
        status: body.status,
        granted_by_admin_id: grantedBy,
        at: new Date().toISOString(),
      });
      console.error(`[admin-accreditation-body] created ${body.id} (${body.name})`);
      return;
    }

    if (cmd === "update") {
      const name = nameOpt ?? positional.slice(1).join(" ").trim();
      if (!name) {
        console.error(USAGE);
        process.exit(2);
      }
      const body = await repo.updateName(id, name);
      auditLog({
        action: "update",
        id: body.id,
        name: body.name,
        status: body.status,
        granted_by_admin_id: grantedBy,
        at: new Date().toISOString(),
      });
      console.error(`[admin-accreditation-body] updated ${body.id} → ${body.name}`);
      return;
    }

    if (cmd === "retire") {
      const body = await repo.retire(id);
      auditLog({
        action: "retire",
        id: body.id,
        name: body.name,
        status: body.status,
        granted_by_admin_id: grantedBy,
        at: new Date().toISOString(),
      });
      console.error(`[admin-accreditation-body] retired ${body.id}`);
      return;
    }

    // activate
    const body = await repo.activate(id);
    auditLog({
      action: "activate",
      id: body.id,
      name: body.name,
      status: body.status,
      granted_by_admin_id: grantedBy,
      at: new Date().toISOString(),
    });
    console.error(`[admin-accreditation-body] activated ${body.id}`);
  } catch (err) {
    if (isServiceError(err)) {
      console.error(`[admin-accreditation-body] ${err.code}: ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[admin-accreditation-body] fatal:", err);
  process.exit(1);
});
