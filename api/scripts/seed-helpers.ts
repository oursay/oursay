/**
 * Shared helpers for api/scripts/seed.ts — civic enroll + write orchestration.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
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
import type { SeedComment, SeedRoot } from "./seed-data/corpus.js";
import type { SeedPerson } from "./seed-data/people.js";
import { ALBERTA_ID, GLOBAL_ID } from "./seed-data/people.js";

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

export async function buildSeedWorld(): Promise<SeedWorld> {
  const db = new Db();
  await db.init();
  const mail = new NoopMailAdapter();
  // Deterministic tier attestations — same as api/test/helpers/world.ts (ignores KYC_PROVIDER=didit in .env).
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

export async function createSeedMember(
  world: SeedWorld,
  person: SeedPerson,
): Promise<SeedMember> {
  const email = `${person.handle}@seed.oursay.dev`;
  const userId = randomUUID();
  const handle = normalizeHandle(person.handle);
  if (!handle) throw new Error(`invalid seed handle: ${person.handle}`);
  const visibility =
    person.officialDistrict !== undefined ? "public" : (person.visibility ?? "public");
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

export function threadRef(root: SeedRoot): ThreadRef {
  return { threadId: root.id, jurisdiction: root.jurisdiction };
}

export async function seedComments(
  member: SeedMember,
  t: ThreadRef,
  parent: { type: "post" | "petition" | "poll" | "comment"; id: string },
  nodes: SeedComment[],
  sign: SignMode,
): Promise<void> {
  for (const node of nodes) {
    await member.client.ensureJoined(t);
    const ref = await member.client.createComment(
      t,
      parent,
      { body: node.body },
      { sign },
    );
    if (node.replies?.length) {
      await seedComments(
        member,
        t,
        { type: "comment", id: ref.entityId },
        node.replies,
        sign,
      );
    }
  }
}

export async function seedRoot(
  members: Map<string, SeedMember>,
  root: SeedRoot,
): Promise<void> {
  const author = members.get(root.author);
  if (!author) throw new Error(`missing seed author ${root.author}`);
  const t = threadRef(root);
  const sign = signModeFor(root.jurisdiction);
  await author.client.ensureJoined(t);

  if (root.kind === "statement") {
    await author.client.createPost(
      t,
      { title: root.title, body: root.body },
      { sign },
    );
    if (root.updateBody) {
      await author.client.append(
        t,
        {
          op: "update",
          type: "post",
          entityId: root.id,
          content: { title: root.title, body: root.updateBody },
        },
        { sign },
      );
    }
  } else if (root.kind === "petition") {
    await author.client.append(
      t,
      {
        op: "create",
        type: "petition",
        entityId: root.id,
        content: {
          title: root.title,
          text: root.body,
          rules: {
            ...root.petitionRules,
            deadline:
              root.petitionRules?.allowRevoke === false
                ? undefined
                : new Date(Date.now() + 30 * 86400_000).toISOString(),
          },
        },
      },
      { sign },
    );
    if (root.updateBody) {
      await author.client.append(
        t,
        {
          op: "update",
          type: "petition",
          entityId: root.id,
          content: { title: root.title, text: root.updateBody, rules: root.petitionRules },
        },
        { sign },
      );
    }
  } else if (root.kind === "poll") {
    await author.client.append(
      t,
      {
        op: "create",
        type: "poll",
        entityId: root.id,
        content: {
          question: root.title,
          options: root.pollOptions ?? ["Yes", "No"],
          ...(root.sourcePetitionId ? { sourcePetitionId: root.sourcePetitionId } : {}),
        },
      },
      { sign },
    );
  } else if (root.kind === "result") {
    await author.client.append(
      t,
      {
        op: "create",
        type: "result",
        entityId: root.id,
        content: {
          title: root.title,
          body: root.body,
          sourcePollId: root.sourcePollId,
          tallies: root.resultTallies,
        },
      },
      { sign },
    );
  }

  const parentType: "post" | "petition" | "poll" =
    root.kind === "statement" ? "post" : root.kind === "result" ? "poll" : root.kind;

  if (root.comments?.length) {
    for (const c of root.comments) {
      const m = members.get(c.handle);
      if (!m) continue;
      await seedComments(m, t, { type: parentType, id: root.id }, [c], signModeFor(root.jurisdiction));
    }
  }

  if (root.reactions) {
    for (const r of root.reactions) {
      const m = members.get(r.handle);
      if (!m) continue;
      await m.client.ensureJoined(t);
      await m.client.addReaction(
        t,
        { type: parentType, id: root.id },
        { kind: r.kind },
        { sign: signModeFor(root.jurisdiction) },
      );
    }
  }

  if (root.signatures) {
    for (const h of root.signatures) {
      const m = members.get(h);
      if (!m) continue;
      await m.client.ensureJoined(t);
      const sigRef = await m.client.append(
        t,
        {
          op: "create",
          type: "petition_signature",
          entityId: randomUUID(),
          parent: { type: "petition", id: root.id },
          content: {},
        },
        { sign: signModeFor(root.jurisdiction) },
      );
      if (root.revokeSignature === h) {
        await m.client.append(
          t,
          { op: "delete", type: "petition_signature", entityId: sigRef.entityId },
          { sign: signModeFor(root.jurisdiction) },
        );
      }
    }
  }

  if (root.votes && root.kind === "poll") {
    for (const v of root.votes) {
      const m = members.get(v.handle);
      if (!m) continue;
      await m.client.ensureJoined(t);
      await m.client.castVote(
        t,
        { type: "poll", id: root.id },
        { option: v.option },
        { sign: signModeFor(root.jurisdiction) },
      );
    }
  }
}
