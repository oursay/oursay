/**
 * Claim / revoke / list official seat assignments (platform ops).
 * Jurisdiction is taken from the seat row — any ingested roster works.
 *
 *   npm run admin:seat -w @oursay/api -- claim  <email> <seatHandle> [--granted-by <userId>]
 *   npm run admin:seat -w @oursay/api -- revoke <seatHandle> [--email <email>]
 *   npm run admin:seat -w @oursay/api -- list [--jurisdiction <jurisdictionId>]
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
import { normalizeEmail } from "../src/helpers/email.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

const USAGE =
  "usage: admin-seat <claim|revoke|list> …\n" +
  "  claim  <email> <seatHandle> [--granted-by <userId>]\n" +
  "  revoke <seatHandle> [--email <email>]\n" +
  "  list [--jurisdiction <jurisdictionId>]\n" +
  "  prod: set OURSAY_ALLOW_PROD_ADMIN=1\n" +
  "  grant actor: --granted-by <userId> or OURSAY_ADMIN_ACTOR_ID";

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
  grantedBy: string | null;
  emailOpt: string | undefined;
  jurisdiction: string | undefined;
} {
  const args = argv.filter((a) => a !== "--");
  let grantedBy: string | null = process.env.OURSAY_ADMIN_ACTOR_ID?.trim() || null;
  let emailOpt: string | undefined;
  let jurisdiction: string | undefined;
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
    if (a === "--jurisdiction") {
      jurisdiction = args[++i]?.trim() || undefined;
      continue;
    }
    if (a.startsWith("-")) continue;
    positional.push(a);
  }
  return { cmd: positional[0], positional: positional.slice(1), grantedBy, emailOpt, jurisdiction };
}

function auditLog(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ role: "official_seat", ...payload }));
}

async function main(): Promise<void> {
  assertAdminCliAllowed();
  const { cmd, positional, grantedBy, emailOpt, jurisdiction } = parseArgs(process.argv.slice(2));
  if (!cmd || !["claim", "revoke", "list"].includes(cmd)) {
    console.error(USAGE);
    process.exit(2);
  }

  const db = new Db();
  await db.init();
  try {
    const services = await buildServices(db);
    const claim = services.officialSeatClaimService;

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

      if (grantedBy) {
        const actor = await services.repos.user.getById(grantedBy);
        if (!actor) {
          console.error(`[admin-seat] --granted-by user not found: ${grantedBy}`);
          process.exit(1);
        }
      }

      const { canonical } = normalizeEmail(email);
      const profile = await services.repos.profile.getByEmailCanonical(canonical);
      if (!profile) {
        console.error(`[admin-seat] no user for email ${email}`);
        process.exit(1);
      }

      await claim.claimSeat(profile.userId, seatHandle);
      const seat = await services.geoStore.getOfficialSeatByHandle(seatHandle);
      const user = await services.repos.user.getById(profile.userId);
      auditLog({
        action: "claim",
        seat_handle: seatHandle,
        jurisdiction_id: seat?.jurisdictionId ?? null,
        target_user_id: profile.userId,
        claimed_user_handle: user?.handle ?? null,
        granted_by_admin_id: grantedBy,
        at: new Date().toISOString(),
      });
      console.error(
        `[admin-seat] claimed ${seatHandle}` +
          (seat ? ` (${seat.jurisdictionId})` : "") +
          ` for ${canonical} (${profile.userId})`,
      );
      return;
    }

    // revoke
    const seatHandle = positional[0];
    if (!seatHandle) {
      console.error(USAGE);
      process.exit(2);
    }

    let expectedUserId: string | undefined;
    if (emailOpt) {
      const { canonical } = normalizeEmail(emailOpt);
      const profile = await services.repos.profile.getByEmailCanonical(canonical);
      if (!profile) {
        console.error(`[admin-seat] no user for email ${emailOpt}`);
        process.exit(1);
      }
      expectedUserId = profile.userId;
    }

    const before = await services.geoStore.getOfficialSeatByHandle(seatHandle);
    await claim.releaseSeat(seatHandle, { expectedUserId });
    auditLog({
      action: "revoke",
      seat_handle: seatHandle,
      jurisdiction_id: before?.jurisdictionId ?? null,
      previous_claimed_user_handle: before?.claimedUserHandle ?? null,
      granted_by_admin_id: grantedBy,
      at: new Date().toISOString(),
    });
    console.error(
      `[admin-seat] revoked ${seatHandle}` +
        (before?.jurisdictionId ? ` (${before.jurisdictionId})` : "") +
        (before?.claimedUserHandle ? ` was @${before.claimedUserHandle}` : " (already unclaimed)"),
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
