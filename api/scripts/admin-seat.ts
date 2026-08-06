/**
 * Claim / revoke / list official seat assignments via platform-ops (signed to the public record).
 * Jurisdiction is taken from the seat row — any ingested roster works.
 *
 *   npm run admin:seat -w @oursay/api -- claim  <email> <seatHandle>
 *   npm run admin:seat -w @oursay/api -- revoke <seatHandle> [--email <email>]
 *   npm run admin:seat -w @oursay/api -- list [--jurisdiction <jurisdictionId>]
 *
 * Development (NODE_ENV=development) always allowed.
 * Production requires OURSAY_ALLOW_PROD_ADMIN=1 (SSH on the deploy host only).
 *
 * Signing: uses the ops service account soft-key (PLATFORM_OPS_ADMIN_PRIVKEY) enrolled in
 * auth.ops_signing_keys. HTTP admins use prepare/submit with an auth passkey instead.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildServices } from "../src/container.js";
import { Db } from "../src/db.js";
import { isServiceError } from "../src/errors.js";
import { normalizeEmail } from "../src/helpers/email.js";
import { ensureOpsServiceAccount } from "../src/helpers/ops-account.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

const USAGE =
  "usage: admin-seat <claim|revoke|list> …\n" +
  "  claim  <email> <seatHandle>\n" +
  "  revoke <seatHandle> [--email <email>]\n" +
  "  list [--jurisdiction <jurisdictionId>]\n" +
  "  prod: set OURSAY_ALLOW_PROD_ADMIN=1\n" +
  "  ops soft-key: PLATFORM_OPS_ADMIN_PRIVKEY (dev fallback exists)";

function assertAdminCliAllowed(): void {
  if (process.env.NODE_ENV === "development") return;
  if (process.env.NODE_ENV === "production" && process.env.OURSAY_ALLOW_PROD_ADMIN === "1") return;
  const env = process.env.NODE_ENV ?? "(unset)";
  throw new Error(
    `Refusing admin-seat: NODE_ENV must be "development", or "production" with OURSAY_ALLOW_PROD_ADMIN=1 (got NODE_ENV=${env}).`,
  );
}

function parseArgs(argv: string[]): {
  cmd: string | undefined;
  positional: string[];
  emailOpt: string | undefined;
  jurisdiction: string | undefined;
} {
  const args = argv.filter((a) => a !== "--");
  let emailOpt: string | undefined;
  let jurisdiction: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--email") {
      emailOpt = args[++i]?.trim() || undefined;
      continue;
    }
    if (a === "--jurisdiction") {
      jurisdiction = args[++i]?.trim() || undefined;
      continue;
    }
    if (a.startsWith("-")) continue;
    positional.push(a);
  }
  return { cmd: positional[0], positional: positional.slice(1), emailOpt, jurisdiction };
}

function auditLog(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ role: "official_seat", ...payload }));
}

async function main(): Promise<void> {
  assertAdminCliAllowed();
  const { cmd, positional, emailOpt, jurisdiction } = parseArgs(process.argv.slice(2));
  if (!cmd || !["claim", "revoke", "list"].includes(cmd)) {
    console.error(USAGE);
    process.exit(2);
  }

  const db = new Db();
  await db.init();
  try {
    const services = await buildServices(db);
    const ops = await ensureOpsServiceAccount(services);

    if (cmd === "list") {
      const seats = await services.geoStore.listClaimedOfficialSeatsAsOf(new Date(), jurisdiction);
      for (const seat of seats) {
        console.log(
          JSON.stringify({
            action: "list",
            seat_handle: seat.seatHandle,
            jurisdiction_id: seat.jurisdictionId,
            title: seat.title,
            seat_kind: seat.seatKind,
            district_slug: seat.districtSlug,
            claimed_user_handle: seat.claimedUserHandle,
            representative_name: seat.representativeName,
            at: new Date().toISOString(),
          }),
        );
      }
      console.error(
        `[admin-seat] ${seats.length} claimed seat(s)` +
          (jurisdiction ? ` in ${jurisdiction}` : ""),
      );
      return;
    }

    if (cmd === "claim") {
      const email = positional[0];
      const seatHandle = positional[1];
      if (!email || !seatHandle) {
        console.error(USAGE);
        process.exit(2);
      }

      const { canonical } = normalizeEmail(email);
      const profile = await services.repos.profile.getByEmailCanonical(canonical);
      if (!profile) {
        console.error(`[admin-seat] no user for email ${email}`);
        process.exit(1);
      }

      const seat = await services.geoStore.getOfficialSeatByHandle(seatHandle);
      if (!seat) {
        console.error(`[admin-seat] official seat not found: ${seatHandle}`);
        process.exit(1);
      }

      const ref = await services.platformOpsService.submitWithOpsSoftKey({
        opsUserId: ops.userId,
        kind: "official_seat_claim",
        jurisdictionId: seat.jurisdictionId,
        payload: { seatHandle, userId: profile.userId },
        opsPrivKeyHex: ops.privKeyHex,
      });
      const user = await services.repos.user.getById(profile.userId);
      auditLog({
        action: "claim",
        seat_handle: seatHandle,
        jurisdiction_id: seat.jurisdictionId,
        target_user_id: profile.userId,
        claimed_user_handle: user?.handle ?? null,
        ops_user_id: ops.userId,
        tx_id: ref.txId,
        entity_id: ref.entityId,
        at: new Date().toISOString(),
      });
      console.error(
        `[admin-seat] claimed ${seatHandle} (${seat.jurisdictionId}) for ${canonical} — tx ${ref.txId}`,
      );
      return;
    }

    // revoke
    const seatHandle = positional[0];
    if (!seatHandle) {
      console.error(USAGE);
      process.exit(2);
    }

    const before = await services.geoStore.getOfficialSeatByHandle(seatHandle);
    if (!before) {
      console.error(`[admin-seat] official seat not found: ${seatHandle}`);
      process.exit(1);
    }

    const payload: Record<string, unknown> = { seatHandle };
    if (emailOpt) {
      const { canonical } = normalizeEmail(emailOpt);
      const profile = await services.repos.profile.getByEmailCanonical(canonical);
      if (!profile) {
        console.error(`[admin-seat] no user for email ${emailOpt}`);
        process.exit(1);
      }
      payload.expectedUserId = profile.userId;
    }

    const ref = await services.platformOpsService.submitWithOpsSoftKey({
      opsUserId: ops.userId,
      kind: "official_seat_revoke",
      jurisdictionId: before.jurisdictionId,
      payload,
      opsPrivKeyHex: ops.privKeyHex,
    });
    auditLog({
      action: "revoke",
      seat_handle: seatHandle,
      jurisdiction_id: before.jurisdictionId,
      previous_claimed_user_handle: before.claimedUserHandle ?? null,
      ops_user_id: ops.userId,
      tx_id: ref.txId,
      entity_id: ref.entityId,
      at: new Date().toISOString(),
    });
    console.error(
      `[admin-seat] revoked ${seatHandle} (${before.jurisdictionId})` +
        (before.claimedUserHandle ? ` was @${before.claimedUserHandle}` : " (already unclaimed)") +
        ` — tx ${ref.txId}`,
    );
  } catch (err) {
    if (isServiceError(err)) {
      console.error(`[admin-seat] ${err.code}: ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[admin-seat] fatal:", err);
  process.exit(1);
});
