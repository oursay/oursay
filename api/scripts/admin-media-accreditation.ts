/**
 * Grant / revoke / list Media accreditations (platform ops).
 *
 *   npm run admin:media-accreditation -w @oursay/api -- grant  <email> <bodyId> [--expires <ISO>] [--note <text>] [--granted-by <userId>]
 *   npm run admin:media-accreditation -w @oursay/api -- revoke <accreditationId>
 *   npm run admin:media-accreditation -w @oursay/api -- list   [--email <email>]
 *
 * Development (NODE_ENV=development) always allowed.
 * Production requires OURSAY_ALLOW_PROD_ADMIN=1.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildServices } from "../src/container.js";
import { Db } from "../src/db.js";
import { isServiceError } from "../src/errors.js";
import { normalizeEmail } from "../src/helpers/email.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

const USAGE =
  "usage: admin-media-accreditation <grant|revoke|list> …\n" +
  "  grant  <email> <bodyId> [--expires <ISO>] [--note <text>] [--granted-by <userId>]\n" +
  "  revoke <accreditationId>\n" +
  "  list [--email <email>]\n" +
  "  prod: set OURSAY_ALLOW_PROD_ADMIN=1\n" +
  "  grant actor: --granted-by <userId> or OURSAY_ADMIN_ACTOR_ID";

function assertAdminCliAllowed(): void {
  if (process.env.NODE_ENV === "development") return;
  if (process.env.NODE_ENV === "production" && process.env.OURSAY_ALLOW_PROD_ADMIN === "1") return;
  const env = process.env.NODE_ENV ?? "(unset)";
  throw new Error(
    `Refusing admin-media-accreditation: NODE_ENV must be "development", or "production" with OURSAY_ALLOW_PROD_ADMIN=1 (got NODE_ENV=${env}).`,
  );
}

function parseArgs(argv: string[]): {
  cmd: string | undefined;
  positional: string[];
  grantedBy: string | null;
  emailOpt: string | undefined;
  expires: string | undefined;
  note: string | undefined;
} {
  const args = argv.filter((a) => a !== "--");
  let grantedBy: string | null = process.env.OURSAY_ADMIN_ACTOR_ID?.trim() || null;
  let emailOpt: string | undefined;
  let expires: string | undefined;
  let note: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--granted-by") {
      grantedBy = args[++i]?.trim() || null;
      continue;
    }
    if (a === "--email") {
      emailOpt = args[++i]?.trim() || undefined;
      continue;
    }
    if (a === "--expires") {
      expires = args[++i]?.trim() || undefined;
      continue;
    }
    if (a === "--note") {
      note = args[++i];
      continue;
    }
    if (a.startsWith("-")) continue;
    positional.push(a);
  }
  return { cmd: positional[0], positional: positional.slice(1), grantedBy, emailOpt, expires, note };
}

function auditLog(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ role: "media_accreditation", ...payload }));
}

async function main(): Promise<void> {
  assertAdminCliAllowed();
  const { cmd, positional, grantedBy, emailOpt, expires, note } = parseArgs(process.argv.slice(2));
  if (!cmd || !["grant", "revoke", "list"].includes(cmd)) {
    console.error(USAGE);
    process.exit(2);
  }

  const db = new Db();
  await db.init();
  try {
    const services = await buildServices(db);
    const repo = services.repos.mediaAccreditation;

    if (cmd === "list") {
      if (!emailOpt) {
        console.error("[admin-media-accreditation] list requires --email <email>");
        process.exit(2);
      }
      const { canonical } = normalizeEmail(emailOpt);
      const profile = await services.repos.profile.getByEmailCanonical(canonical);
      if (!profile) {
        console.error(`[admin-media-accreditation] no user for email ${emailOpt}`);
        process.exit(1);
      }
      const rows = await repo.listForUser(profile.userId);
      for (const r of rows) {
        console.log(
          JSON.stringify({
            action: "list",
            id: r.id,
            target_user_id: r.userId,
            accreditation_body_id: r.accreditationBodyId,
            expires_at: r.expiresAt,
            revoked_at: r.revokedAt,
            granted_at: r.grantedAt,
            granted_by_admin_id: r.grantedByAdminId,
            note: r.note,
            at: new Date().toISOString(),
          }),
        );
      }
      console.error(`[admin-media-accreditation] ${rows.length} accreditation(s) for ${canonical}`);
      return;
    }

    if (grantedBy) {
      const actor = await services.repos.user.getById(grantedBy);
      if (!actor) {
        console.error(`[admin-media-accreditation] --granted-by user not found: ${grantedBy}`);
        process.exit(1);
      }
    }

    if (cmd === "grant") {
      const email = positional[0];
      const bodyId = positional[1];
      if (!email || !bodyId) {
        console.error(USAGE);
        process.exit(2);
      }
      let expiresAt: Date | null = null;
      if (expires) {
        expiresAt = new Date(expires);
        if (Number.isNaN(expiresAt.getTime())) {
          console.error(`[admin-media-accreditation] invalid --expires ISO: ${expires}`);
          process.exit(2);
        }
      }
      const { canonical } = normalizeEmail(email);
      const profile = await services.repos.profile.getByEmailCanonical(canonical);
      if (!profile) {
        console.error(`[admin-media-accreditation] no user for email ${email}`);
        process.exit(1);
      }
      const row = await repo.grant({
        userId: profile.userId,
        accreditationBodyId: bodyId,
        grantedByAdminId: grantedBy,
        expiresAt,
        note,
      });
      auditLog({
        action: "grant",
        id: row.id,
        target_user_id: row.userId,
        accreditation_body_id: row.accreditationBodyId,
        expires_at: row.expiresAt,
        granted_by_admin_id: grantedBy,
        at: new Date().toISOString(),
      });
      console.error(
        `[admin-media-accreditation] granted ${row.accreditationBodyId} → ${canonical} (${row.id})`,
      );
      return;
    }

    // revoke
    const id = positional[0];
    if (!id) {
      console.error(USAGE);
      process.exit(2);
    }
    const row = await repo.revoke(id);
    auditLog({
      action: "revoke",
      id: row.id,
      target_user_id: row.userId,
      accreditation_body_id: row.accreditationBodyId,
      granted_by_admin_id: grantedBy,
      at: new Date().toISOString(),
    });
    console.error(`[admin-media-accreditation] revoked ${row.id}`);
  } catch (err) {
    if (isServiceError(err)) {
      console.error(`[admin-media-accreditation] ${err.code}: ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[admin-media-accreditation] fatal:", err);
  process.exit(1);
});
