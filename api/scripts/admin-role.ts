/**
 * Grant / revoke / list the platform-scoped `admin` role by email.
 *
 *   npm run admin:role -w @oursay/api -- grant  <email> [--granted-by <userId>]
 *   npm run admin:role -w @oursay/api -- revoke <email>
 *   npm run admin:role -w @oursay/api -- list
 *
 * Development (NODE_ENV=development) always allowed.
 * Production requires OURSAY_ALLOW_PROD_ADMIN=1 (SSH on the deploy host only).
 *
 * Optional actor for audit: --granted-by <userId> or OURSAY_ADMIN_ACTOR_ID.
 * Bootstrap (first admin) may omit the actor — granted_by_admin_id stays NULL.
 *
 * granted_via = cli (documented for audit; not a DB column in V1-A).
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildServices } from "../src/container.js";
import { Db } from "../src/db.js";
import { normalizeEmail } from "../src/helpers/email.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

const USAGE =
  "usage: admin-role <grant|revoke|list> [email] [--granted-by <userId>]\n" +
  "  prod: set OURSAY_ALLOW_PROD_ADMIN=1\n" +
  "  grant actor: --granted-by <userId> or OURSAY_ADMIN_ACTOR_ID";

function assertAdminCliAllowed(): void {
  if (process.env.NODE_ENV === "development") return;
  if (process.env.NODE_ENV === "production" && process.env.OURSAY_ALLOW_PROD_ADMIN === "1") return;
  const env = process.env.NODE_ENV ?? "(unset)";
  throw new Error(
    `Refusing admin-role: NODE_ENV must be "development", or "production" with OURSAY_ALLOW_PROD_ADMIN=1 (got NODE_ENV=${env}).`,
  );
}

function parseArgs(argv: string[]): {
  cmd: string | undefined;
  email: string | undefined;
  grantedBy: string | null;
} {
  const args = argv.filter((a) => a !== "--");
  let grantedBy: string | null = process.env.OURSAY_ADMIN_ACTOR_ID?.trim() || null;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--granted-by") {
      grantedBy = args[++i]?.trim() || null;
      continue;
    }
    if (a.startsWith("-")) continue;
    positional.push(a);
  }
  return { cmd: positional[0], email: positional[1], grantedBy };
}

function auditLog(payload: {
  action: string;
  target_user_id: string | null;
  granted_by_admin_id: string | null;
  at: string;
  role?: string;
}): void {
  console.log(JSON.stringify({ role: "admin", ...payload }));
}

async function main(): Promise<void> {
  assertAdminCliAllowed();
  const { cmd, email, grantedBy } = parseArgs(process.argv.slice(2));
  if (!cmd || !["grant", "revoke", "list"].includes(cmd)) {
    console.error(USAGE);
    process.exit(2);
  }
  if ((cmd === "grant" || cmd === "revoke") && !email) {
    console.error(USAGE);
    process.exit(2);
  }

  const db = new Db();
  await db.init();
  try {
    const services = await buildServices(db);
    const repo = services.repos.platformRole;

    if (cmd === "list") {
      const admins = await repo.listAdmins();
      for (const a of admins) {
        const profile = await services.repos.profile.getByUserId(a.userId);
        const user = await services.repos.user.getById(a.userId);
        console.log(
          JSON.stringify({
            action: "list",
            target_user_id: a.userId,
            email: profile?.email ?? null,
            handle: user?.handle ?? null,
            granted_by_admin_id: a.grantedByAdminId,
            granted_at: a.grantedAt,
            at: new Date().toISOString(),
          }),
        );
      }
      console.error(`[admin-role] ${admins.length} admin(s)`);
      return;
    }

    const { canonical } = normalizeEmail(email!);
    const profile = await services.repos.profile.getByEmailCanonical(canonical);
    if (!profile) {
      console.error(`[admin-role] no user for email ${email}`);
      process.exit(1);
    }
    const targetUserId = profile.userId;

    if (cmd === "grant") {
      if (grantedBy) {
        const actor = await services.repos.user.getById(grantedBy);
        if (!actor) {
          console.error(`[admin-role] --granted-by user not found: ${grantedBy}`);
          process.exit(1);
        }
      }
      await repo.grant(targetUserId, "admin", grantedBy);
      auditLog({
        action: "grant",
        target_user_id: targetUserId,
        granted_by_admin_id: grantedBy,
        at: new Date().toISOString(),
      });
      console.error(`[admin-role] granted admin to ${canonical} (${targetUserId})`);
      return;
    }

    // revoke
    const has = await repo.hasRole(targetUserId, "admin");
    if (has) {
      const n = await repo.countAdmins();
      if (n <= 1) {
        console.error(
          "[admin-role] refuse revoke: target is the last remaining admin (do not orphan the platform)",
        );
        process.exit(1);
      }
    }
    await repo.revoke(targetUserId, "admin");
    auditLog({
      action: "revoke",
      target_user_id: targetUserId,
      granted_by_admin_id: grantedBy,
      at: new Date().toISOString(),
    });
    console.error(`[admin-role] revoked admin from ${canonical} (${targetUserId})`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[admin-role] fatal:", err);
  process.exit(1);
});
