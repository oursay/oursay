/**
 * Shared helpers for api/scripts/seed.ts — civic enroll + write orchestration.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { CivicHttpClient, ThreadRef } from "@oursay/identity/client";
import { CivicHttpClient as Client, DevPasskeyConnector, IdentitySession as Session } from "@oursay/identity/client";
import type { SignMode } from "@oursay/identity";
import type { Services } from "../src/container.js";
import { buildServer } from "../src/http/server.js";
import { Db } from "../src/db.js";
import { buildServices } from "../src/container.js";
import { kycConfig } from "../src/config.js";
import { normalizeHandle } from "../src/helpers/handle.js";
import { NoopMailAdapter } from "../src/services/mailer/adapters/noop.js";
import { injectFetch } from "../test/helpers/inject-fetch.js";
import type { FastifyInstance } from "fastify";
import type { PostKind, PostTemplate } from "./seed-data/content.js";
import type { EntityRules } from "@oursay/public-record/schema/types";
import type { SeedPerson } from "./seed-data/people.js";
import { ALBERTA_ID, GLOBAL_ID } from "./seed-data/people.js";

export type Rng = () => number;

export interface SeedWorld {
  db: Db;
  services: Services;
  app: FastifyInstance;
}

export interface SeedMember {
  userId: string;
  token: string;
  handle: string;
  client: CivicHttpClient;
  passkey: DevPasskeyConnector;
}

export interface SeededPost {
  slug: string;
  id: string;
  kind: PostKind;
  jurisdiction: string;
  authorHandle: string;
  appliesToDistrictIds: string[];
  pollOptions?: string[];
  specificComments?: string[];
}

function governanceForCreate(template: PostTemplate, kind: PostKind): EntityRules | undefined {
  if (!template.governance) return undefined;
  const rules: EntityRules = { ...template.governance };
  if (kind === "petition" && rules.allowRevoke !== false) {
    rules.deadline = new Date(Date.now() + 30 * 86400_000).toISOString();
  }
  return rules;
}

export interface SeededComment {
  id: string;
  postId: string;
  authorHandle: string;
  parentType: "post" | "comment";
}

const PASSKEY_ROOT = join(process.cwd(), ".oursay-dev", "seed-passkeys");

/** Known interior points per home district slug (EPSG:4326). */
export const DISTRICT_POINTS: Record<string, { lon: number; lat: number }> = {
  "edmonton-strathcona": { lon: -113.52, lat: 53.52 },
  "edmonton-city-centre": { lon: -113.5065, lat: 53.5333 },
  "calgary-elbow": { lon: -114.07, lat: 51.04 },
};

export function signModeFor(jurisdiction: string): SignMode {
  return jurisdiction === ALBERTA_ID ? "passkey" : "quick";
}

export function pickRandom<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

export function shuffle<T>(rng: Rng, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export async function buildSeedWorld(): Promise<SeedWorld> {
  const db = new Db();
  await db.init();
  const mail = new NoopMailAdapter();
  const services = await buildServices(db, {
    mailerOverrides: { noop: mail },
    kyc: { ...kycConfig, provider: "stub" },
  });
  const app = await buildServer(services, { rateLimit: false });
  return { db, services, app };
}

export function clearPasskeyDir(): void {
  if (existsSync(PASSKEY_ROOT)) rmSync(PASSKEY_ROOT, { recursive: true, force: true });
  mkdirSync(PASSKEY_ROOT, { recursive: true });
}

export async function createSeedMember(world: SeedWorld, person: SeedPerson): Promise<SeedMember> {
  const email = `${person.handle}@seed.oursay.dev`;
  const userId = randomUUID();
  const handle = normalizeHandle(person.handle);
  if (!handle) throw new Error(`invalid seed handle: ${person.handle}`);
  const visibility =
    person.officialDistrict !== undefined || person.globalOfficial
      ? "public"
      : (person.visibility ?? "public");
  await world.services.repos.user.create({
    id: userId,
    handle,
    displayName: person.name,
  });
  await world.services.repos.profile.insert({
    userId,
    firstName: null,
    lastName: null,
    line1: null,
    line2: null,
    city: null,
    province: person.districts?.length ? "AB" : null,
    postalCode: null,
    country: "CA",
    memo: null,
    over18: true,
    visibility,
    email,
    emailCanonical: email.toLowerCase(),
  });

  await world.services.repos.membership.add(userId, GLOBAL_ID);
  for (const j of person.jurisdictions ?? []) {
    if (j !== GLOBAL_ID) await world.services.repos.membership.add(userId, j);
  }
  if (person.officialDistrict !== undefined) {
    await world.services.repos.membership.setRole(
      userId,
      ALBERTA_ID,
      "official",
      person.officialDistrict,
    );
  }
  if (person.globalOfficial) {
    await world.services.repos.membership.setRole(userId, GLOBAL_ID, "official", null);
  }

  if (person.tier >= 1) {
    await world.services.kycService.attest(
      userId,
      person.tier >= 2 ? "residency_verified" : "identity_verified",
    );
  }
  if (person.tier >= 2 && person.districts?.length) {
    const slug = person.districts[0]!;
    const pt = DISTRICT_POINTS[slug];
    if (pt) {
      await world.services.repos.geocode.upsertCurrent({
        userId,
        addressHash: `seed:${person.handle}`,
        lon: pt.lon,
        lat: pt.lat,
        provider: "seed",
        confidence: 0.9,
      });
    }
  }

  const session = await world.services.authService.issue(userId, "full", "seed");
  const passkey = new DevPasskeyConnector({
    rootDir: join(PASSKEY_ROOT, person.handle),
    seed: person.handle,
  });
  await passkey.enrollDevice({ userId, deviceId: "seed", label: "seed device" });
  const sess = new Session(await passkey.unlock({ userId, deviceId: "seed" }));
  const client = new Client({
    baseUrl: "http://localhost",
    session: sess,
    token: session.token,
    fetch: injectFetch(world.app),
  });

  return { userId, token: session.token, handle: person.handle, client, passkey };
}

export async function createPostFromTemplate(
  member: SeedMember,
  template: PostTemplate,
  entityId: string,
  jurisdiction: string,
): Promise<SeededPost> {
  const t: ThreadRef = { threadId: entityId, jurisdiction };
  const sign = signModeFor(jurisdiction);
  await member.client.ensureJoined(t);

  const rules = governanceForCreate(template, template.kind);

  if (template.kind === "statement") {
    await member.client.createPost(t, { title: template.title, body: template.body }, { sign });
  } else if (template.kind === "petition") {
    await member.client.append(
      t,
      {
        op: "create",
        type: "petition",
        entityId,
        content: {
          title: template.title,
          text: template.body,
          ...(rules ? { rules } : {}),
        },
      },
      { sign },
    );
  } else if (template.kind === "poll") {
    await member.client.append(
      t,
      {
        op: "create",
        type: "poll",
        entityId,
        content: {
          question: template.title,
          options: template.pollOptions ?? ["Yes", "No"],
          ...(rules ? { rules } : {}),
        },
      },
      { sign },
    );
  }

  return {
    slug: template.slug,
    id: entityId,
    kind: template.kind,
    jurisdiction,
    authorHandle: member.handle,
    appliesToDistrictIds: template.governance?.appliesToDistrictIds ?? [],
    pollOptions: template.pollOptions,
    specificComments: template.specificComments,
  };
}
