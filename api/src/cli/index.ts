// Dev/admin CLI. Every command goes through the SAME service layer the HTTP routes use — proving the
// services are reusable without HTTP. Run: `npm run cli -w @oursay/api -- <command> [args]`.

import { randomUUID } from "node:crypto";
import { buildServices } from "../container.js";
import { Db } from "../db.js";
import { normalizeAddress } from "../helpers/address.js";
import { normalizeEmail } from "../helpers/email.js";
import { isValidHandle, normalizeHandle } from "../helpers/handle.js";

type Handler = (services: Awaited<ReturnType<typeof buildServices>>, args: string[]) => Promise<void>;

const COMMANDS: Record<string, { help: string; run: Handler }> = {
  "send-test-otp": {
    help: "send-test-otp <email> [registration|recovery]  — issue an OTP via the configured mailer",
    run: async (s, [email, purpose = "registration"]) => {
      if (!email) throw new Error("email is required");
      await s.otpService.request({ emailRaw: email, purpose: purpose as "registration" | "recovery", ip: null });
      console.log(`Queued ${purpose} OTP for ${email} (check the mailer; codes are never printed).`);
    },
  },
  "list-sessions": {
    help: "list-sessions <userId>  — list a user's sessions",
    run: async (s, [userId]) => {
      if (!userId) throw new Error("userId is required");
      const sessions = await s.authService.listForUser(userId);
      console.table(
        sessions.map((x) => ({ id: x.id, scope: x.scope, createdAt: x.createdAt, expiresAt: x.expiresAt, revoked: !!x.revokedAt })),
      );
    },
  },
  "expire-sessions": {
    help: "expire-sessions <userId>  — revoke all of a user's active sessions",
    run: async (s, [userId]) => {
      if (!userId) throw new Error("userId is required");
      const n = await s.authService.revokeAllForUser(userId);
      console.log(`Revoked ${n} session(s) for ${userId}.`);
    },
  },
  "create-user": {
    help: "create-user <handle> <email> <birthdate YYYY-MM-DD>  — dev shortcut (no OTP)",
    run: async (s, [handleArg, email, birthdate]) => {
      if (!handleArg || !email || !birthdate) throw new Error("handle, email, birthdate are required");
      const handle = normalizeHandle(handleArg);
      if (!handle || !isValidHandle(handle)) throw new Error("handle must be an @username (letters, digits, underscore; no spaces)");
      const { email: normalized, canonical } = normalizeEmail(email);
      const userId = randomUUID();
      await s.repos.user.create({ id: userId, handle });
      const addr = normalizeAddress({});
      await s.repos.profile.insert({
        userId, firstName: null, lastName: null,
        line1: addr.line1, line2: addr.line2, city: addr.city, province: addr.province,
        postalCode: addr.postalCode, country: addr.country, memo: addr.memo,
        birthdate, email: normalized, emailCanonical: canonical,
      });
      console.log(`Created user ${userId} (${handle} <${normalized}>).`);
    },
  },
};

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || !COMMANDS[command]) {
    console.log("OurSay API CLI\n\nCommands:");
    for (const c of Object.values(COMMANDS)) console.log(`  ${c.help}`);
    process.exit(command && command !== "help" ? 1 : 0);
  }

  const db = new Db();
  await db.init();
  const services = await buildServices(db);
  try {
    await COMMANDS[command].run(services, args);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("CLI error:", (err as Error).message);
  process.exit(1);
});
