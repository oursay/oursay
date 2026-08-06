// Shared test world: one DB + service graph + Fastify app for the run. The mailer uses a
// NoopMailAdapter whose in-memory outbox lets tests read the emailed OTP code (the code is never
// logged or returned by the API). Each spec calls resetWorld() to truncate auth + account rows.

import type { FastifyInstance } from "fastify";
import { kycConfig } from "../../src/config.js";
import { buildServices, type Services } from "../../src/container.js";
import { Db } from "../../src/db.js";
import { buildServer } from "../../src/http/server.js";
import type { PasskeyRepoInstrumentation } from "../../src/repo/passkey.repo.js";
import { NoopMailAdapter } from "../../src/services/mailer/adapters/noop.js";

export interface World {
  db: Db;
  services: Services;
  app: FastifyInstance;
  mail: NoopMailAdapter;
  /** Present in the shared test world; dedicated live-test worlds may omit it. */
  passkeyRepoInstrumentation?: PasskeyRepoInstrumentation;
}

let world: World | undefined;

export async function getWorld(): Promise<World> {
  if (world) return world;
  const db = new Db();
  await db.init();
  const mail = new NoopMailAdapter();
  const passkeyRepoInstrumentation: PasskeyRepoInstrumentation = {};
  // The shared world always runs the offline stub KYC provider so the suite is deterministic even when
  // a developer has KYC_PROVIDER=didit in api/.env for a live walk. The live didit specs (33/34) build
  // their own didit-backed world/client instead of relying on this one.
  const services = await buildServices(db, {
    mailerOverrides: { noop: mail },
    kyc: { ...kycConfig, provider: "stub" },
    passkeyRepoInstrumentation,
  });
  // Disable the HTTP rate-limiter for the shared test app — its in-memory counters would otherwise
  // accumulate across specs. The service-layer OTP rate limit (auth.otp_rate_limits) is still active
  // and is exercised directly in 01-otp / 06-ratelimit.
  const app = await buildServer(services, { rateLimit: false });
  world = { db, services, app, mail, passkeyRepoInstrumentation };
  return world;
}

/** Truncate all auth + account rows and clear the mail outbox for test isolation. */
export async function resetWorld(): Promise<World> {
  const w = await getWorld();
  await w.db.reset();
  w.mail.clear();
  return w;
}

/** Extract the OTP code from the most recent email (the noop outbox holds the full body). */
export function codeFromLastMail(mail: NoopMailAdapter, to?: string): string {
  const msg = mail.last(to);
  if (!msg) throw new Error("no mail queued");
  const m = /(\d{4,8})/.exec(msg.text);
  if (!m) throw new Error("no code found in mail body");
  return m[1];
}
