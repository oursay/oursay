// Shared test world: one DB + service graph + Fastify app for the run. The mailer uses a
// NoopMailAdapter whose in-memory outbox lets tests read the emailed OTP code (the code is never
// logged or returned by the API). Each spec calls resetWorld() to truncate auth + account rows.

import type { FastifyInstance } from "fastify";
import { buildServices, type Services } from "../../src/container.js";
import { Db } from "../../src/db.js";
import { buildServer } from "../../src/http/server.js";
import { NoopMailAdapter } from "../../src/services/mailer/adapters/noop.js";

export interface World {
  db: Db;
  services: Services;
  app: FastifyInstance;
  mail: NoopMailAdapter;
}

let world: World | undefined;

export async function getWorld(): Promise<World> {
  if (world) return world;
  const db = new Db();
  await db.init();
  const mail = new NoopMailAdapter();
  const services = await buildServices(db, { mailerOverrides: { noop: mail } });
  const app = await buildServer(services);
  world = { db, services, app, mail };
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
