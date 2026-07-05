// Per-jurisdiction PUBLIC COUNT EXPOSURE policy (mvp-c9-jurisdiction-config + mvp-c9b-count-gating). A
// layer ABOVE the C7/C8 geo/tier filtering: JurisdictionConfig.counts decides whether a petition
// signature scalar / poll vote tally may appear on the public surfaces AT ALL, reported via `countGating`
// (none | withheld | tier-gated). The same shaped data yields different counts depending on the thread's
// audienceScope.jurisdiction:
//   - oursay-global (permissive) ⇒ countGating "none", raw scalar exposed.
//   - ab-ca-gov (tier-gated)     ⇒ countGating "tier-gated"; scalar null unless the request restricts to
//                                  verified tiers ⊆ {identity_verified, residency_verified}.
//   - a withheld jurisdiction    ⇒ countGating "withheld"; scalar null on every surface, even with ?tier=.
// The gate is enforced on list + detail + counts (so it can't be bypassed by reading the browse list).
// Reaction tallies are never gated. We drive REAL signed civic writes, then attest tiers via KycService.

import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";

process.env.OURSAY_DEV_PASSKEY = "1"; // dev passkey custody is env-guarded; set before first construct.

import { CivicHttpClient, DevPasskeyConnector, IdentitySession } from "@oursay/identity/client";
import type { ThreadRef } from "@oursay/identity";
import { jurisdictions } from "@oursay/jurisdiction-data";
import { getJurisdiction, registerJurisdiction } from "@oursay/public-record";
import type { KycTier } from "../src/types/kyc.js";
import { injectFetch } from "./helpers/inject-fetch.js";
import { resetWorld, type World } from "./helpers/world.js";

const ADULT_DOB = "1990-06-15";
const OURSAY_GLOBAL = "oursay-global"; // permissive (open sandbox)
const AB_CA_GOV = "ab-ca-gov"; //         tier-gated (verified tiers only)
const WITHHELD = "test-cg-withheld"; //   ad-hoc: votes/signatures never exposed

interface Member {
  userId: string;
  sess: IdentitySession;
  client: CivicHttpClient;
}

async function fullSessionAccount(w: World, email: string): Promise<{ userId: string; token: string }> {
  const userId = randomUUID();
  await w.services.repos.user.create({ id: userId, handle: `@u${userId.slice(0, 8)}` });
  await w.services.repos.profile.insert({
    userId, firstName: null, lastName: null,
    line1: null, line2: null, city: null, province: "AB", postalCode: null, country: "CA",
    memo: null, birthdate: ADULT_DOB, email, emailCanonical: email.toLowerCase(),
  });
  const session = await w.services.authService.issue(userId, "full", "test");
  return { userId, token: session.token };
}

/** Enroll a device + join the GIVEN shared thread `t` (so many members participate on one root). */
async function joinMember(w: World, email: string, seed: string, t: ThreadRef): Promise<Member> {
  const { userId, token } = await fullSessionAccount(w, email);
  const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-cg-")), seed });
  await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
  const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
  const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });
  await client.ensureJoined(t);
  return { userId, sess, client };
}

async function attest(w: World, m: Member, tier: KycTier): Promise<void> {
  await w.services.kycService.attest(m.userId, tier);
}

function threadIn(jurisdiction: string): ThreadRef {
  return { threadId: randomUUID(), jurisdiction };
}

async function get(w: World, url: string): Promise<any> {
  const res = await w.app.inject({ method: "GET", url });
  expect(res.statusCode, res.payload).to.equal(200);
  return res.json();
}
const counts = (w: World, kind: "polls" | "petitions" | "posts", id: string, query = "") =>
  get(w, `/v1/public/${kind}/${id}/counts${query}`);
const detail = (w: World, kind: "polls" | "petitions" | "posts", id: string) => get(w, `/v1/public/${kind}/${id}`);
const listItem = async (w: World, kind: "polls" | "petitions" | "posts", id: string) =>
  (await get(w, `/v1/public/${kind}`)).items.find((i: any) => i.entityId === id);

function optionCount(results: { option: string; count: number | null }[], option: string) {
  return results.find((r) => r.option === option);
}

/** Author + seed a petition with `n` residency-verified signers and one unverified signer on a thread in
 *  `jurisdiction`. Returns the petition id. */
async function seedPetition(w: World, jurisdiction: string, tag: string, residencySigners: number): Promise<string> {
  const t = threadIn(jurisdiction);
  const author = await joinMember(w, `cg-${tag}-author@example.com`, `${tag}-author`, t);
  await author.client.append(t, { op: "create", type: "petition", entityId: t.threadId, content: { title: "Fix it", text: "please" } });
  const sign = (m: Member) =>
    m.client.append(t, { op: "create", type: "petition_signature", entityId: randomUUID(), parent: { type: "petition", id: t.threadId }, content: {} });
  for (let i = 0; i < residencySigners; i++) {
    const m = await joinMember(w, `cg-${tag}-res${i}@example.com`, `${tag}-res${i}`, t);
    await sign(m);
    await attest(w, m, "residency_verified");
  }
  const unv = await joinMember(w, `cg-${tag}-unv@example.com`, `${tag}-unv`, t);
  await sign(unv);
  return t.threadId;
}

describe("18 public-record counts: per-jurisdiction exposure gating (countGating)", () => {
  let w: World;

  before(async function () {
    this.timeout(60000);
    w = await resetWorld();
    // Make the suite order-independent: (re)register the packaged jurisdictions (oursay-global permissive,
    // ab-ca-gov tier-gated) and an ad-hoc fully-withheld jurisdiction.
    for (const j of jurisdictions) registerJurisdiction(j);
    registerJurisdiction({ id: WITHHELD, level: "test", rules: {}, counts: { votes: false, signatures: false } });
  });

  afterEach(() => {
    delete process.env.PUBLIC_COUNTS_K_ANONYMITY_MIN;
    delete process.env.PUBLIC_COUNTS_K_ANONYMITY_DEFAULT;
  });
  function disableKAnon() {
    process.env.PUBLIC_COUNTS_K_ANONYMITY_MIN = "0";
    process.env.PUBLIC_COUNTS_K_ANONYMITY_DEFAULT = "0";
  }

  it("sanity: the packaged ab-ca-gov policy is tier-gated and excludes electoral_validated", () => {
    const policy = getJurisdiction(AB_CA_GOV).counts;
    expect(policy).to.deep.equal({ votes: true, signatures: true, minTier: ["identity_verified", "residency_verified"] });
    expect(getJurisdiction(OURSAY_GLOBAL).counts).to.deep.equal({ votes: true, signatures: true });
  });

  it("oursay-global (permissive): petition signature scalar is exposed (countGating none) on counts/detail/list", async function () {
    this.timeout(60000);
    disableKAnon();
    const id = await seedPetition(w, OURSAY_GLOBAL, "og-pet", 2); // 2 residency + 1 unverified = 3 signatures

    const c = await counts(w, "petitions", id);
    expect(c.signatureCount).to.equal(3);
    expect(c.suppressed).to.equal(false);
    expect(c.countGating).to.equal("none");

    const d = await detail(w, "petitions", id);
    expect(d.signatureCount).to.equal(3);
    expect(d.countGating).to.equal("none");

    const item = await listItem(w, "petitions", id);
    expect(item.signatureCount).to.equal(3);
    expect(item.countGating).to.equal("none");
  });

  it("ab-ca-gov (tier-gated): scalar withheld with no tier; unlocked when filtered to verified tiers", async function () {
    this.timeout(60000);
    disableKAnon();
    const id = await seedPetition(w, AB_CA_GOV, "ab-pet", 2); // 2 residency + 1 unverified

    // No tier ⇒ tier-gated, scalar null (NOT suppressed — that is k-anon, which we disabled).
    const noTier = await counts(w, "petitions", id);
    expect(noTier.signatureCount).to.equal(null);
    expect(noTier.suppressed).to.equal(false);
    expect(noTier.countGating).to.equal("tier-gated");

    // ?tier=residency_verified (⊆ minTier) ⇒ unlocked, count reflects the 2 residency signers.
    const resTier = await counts(w, "petitions", id, "?tier=residency_verified");
    expect(resTier.signatureCount).to.equal(2);
    expect(resTier.countGating).to.equal("tier-gated");
    expect(resTier.filters.applied.tier).to.equal(true);

    // ?tier=unverified (⊄ minTier) ⇒ still withheld.
    const unvTier = await counts(w, "petitions", id, "?tier=unverified");
    expect(unvTier.signatureCount).to.equal(null);
    expect(unvTier.countGating).to.equal("tier-gated");

    // ?tier=identity_verified&tier=electoral_validated ⇒ electoral_validated ∉ minTier ⇒ withheld.
    const elecTier = await counts(w, "petitions", id, "?tier=identity_verified&tier=electoral_validated");
    expect(elecTier.signatureCount).to.equal(null);
    expect(elecTier.countGating).to.equal("tier-gated");

    // The gate is NOT bypassable via list/detail (no tier filtering there ⇒ always withheld).
    const d = await detail(w, "petitions", id);
    expect(d.signatureCount).to.equal(null);
    expect(d.countGating).to.equal("tier-gated");
    const item = await listItem(w, "petitions", id);
    expect(item.signatureCount).to.equal(null);
    expect(item.countGating).to.equal("tier-gated");
  });

  it("ab-ca-gov (tier-gated): poll option tallies follow the same gate; labels stay listed", async function () {
    this.timeout(60000);
    disableKAnon();
    const t = threadIn(AB_CA_GOV);
    const author = await joinMember(w, "cg-ab-poll-author@example.com", "ab-poll-author", t);
    await author.client.append(t, { op: "create", type: "poll", entityId: t.threadId, content: { question: "Build it?", options: ["yes", "no"] } });
    const parent = { type: "poll" as const, id: t.threadId };
    const v1 = await joinMember(w, "cg-ab-poll-v1@example.com", "ab-poll-v1", t);
    const v2 = await joinMember(w, "cg-ab-poll-v2@example.com", "ab-poll-v2", t);
    for (const m of [v1, v2]) await m.client.castVote(t, parent, { option: "yes" });
    await attest(w, v1, "residency_verified");
    await attest(w, v2, "residency_verified");

    // No tier ⇒ withheld: the tallied option stays LISTED, but its count is nulled (results are derived
    // from cast votes, so an option with no votes — "no" here — simply isn't present).
    const noTier = await counts(w, "polls", t.threadId);
    expect(noTier.countGating).to.equal("tier-gated");
    expect(optionCount(noTier.results, "yes")).to.not.equal(undefined);
    expect(optionCount(noTier.results, "yes")!.count).to.equal(null);

    // ?tier=residency_verified ⇒ unlocked, "yes" = 2.
    const resTier = await counts(w, "polls", t.threadId, "?tier=residency_verified");
    expect(resTier.countGating).to.equal("tier-gated");
    expect(optionCount(resTier.results, "yes")!.count).to.equal(2);
  });

  it("ab-ca-gov: k-anonymity suppression is orthogonal to exposure (unlocked but below floor ⇒ suppressed)", async function () {
    this.timeout(60000);
    // env unset ⇒ floor 5/5. Unlock via ?tier=residency_verified, but only 2 signers ⇒ 0 < 2 < 5 ⇒ suppressed.
    const id = await seedPetition(w, AB_CA_GOV, "ab-kanon", 2);
    const resTier = await counts(w, "petitions", id, "?tier=residency_verified");
    expect(resTier.countGating).to.equal("tier-gated"); // policy state — exposure unlocked
    expect(resTier.signatureCount).to.equal(null);
    expect(resTier.suppressed).to.equal(true); // ...but the small bucket is k-anon suppressed
    expect(resTier.filters.kAnonymityFloor).to.equal(5);
  });

  it("withheld jurisdiction: scalar null on every surface, even with a matching tier filter", async function () {
    this.timeout(60000);
    disableKAnon();
    const id = await seedPetition(w, WITHHELD, "wh-pet", 2);

    for (const c of [await counts(w, "petitions", id), await counts(w, "petitions", id, "?tier=residency_verified")]) {
      expect(c.signatureCount).to.equal(null);
      expect(c.countGating).to.equal("withheld");
    }
    const d = await detail(w, "petitions", id);
    expect(d.signatureCount).to.equal(null);
    expect(d.countGating).to.equal("withheld");
    const item = await listItem(w, "petitions", id);
    expect(item.signatureCount).to.equal(null);
    expect(item.countGating).to.equal("withheld");
  });

  it("reactions are never gated: post tallies stay visible under the tier-gated ab-ca-gov", async function () {
    this.timeout(60000);
    disableKAnon();
    const t = threadIn(AB_CA_GOV);
    const author = await joinMember(w, "cg-ab-post-author@example.com", "ab-post-author", t);
    await author.client.createPost(t, { title: "Test post", body: "open belief" });
    const parent = { type: "post" as const, id: t.threadId };
    const r1 = await joinMember(w, "cg-ab-post-r1@example.com", "ab-post-r1", t);
    const r2 = await joinMember(w, "cg-ab-post-r2@example.com", "ab-post-r2", t);
    for (const m of [r1, r2]) await m.client.addReaction(t, parent, { kind: "check" });

    const checkOf = (body: any) => body.reactionsByEntity.find((r: any) => r.kind === "check")?.count ?? 0;
    expect(checkOf(await counts(w, "posts", t.threadId))).to.equal(2);
    expect(checkOf(await detail(w, "posts", t.threadId))).to.equal(2);
  });
});
