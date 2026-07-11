/**
 * Runtime seed orchestration — assigns authors, reactions, comments, and replies from content templates.
 */

import { randomUUID } from "node:crypto";
import {
  GENERIC_REPLY_COMMENTS,
  GENERIC_ROOT_COMMENTS,
  jurisdictionForScope,
  POST_TEMPLATES,
  seedUuid,
  SHOWCASE_BINDINGS,
  type PostKind,
  type PostTemplate,
} from "./seed-data/content.js";
import {
  ALBERTA_ID,
  DISTRICT_SLUGS,
  FIRST_NAMES,
  GENERATED_VISIBILITY_MIX,
  LAST_NAMES,
  SEED_ANCHORS,
  type SeedPerson,
  type SeedVisibility,
} from "./seed-data/people.js";
import {
  applySeedSeatClaims,
  createPostFromTemplate,
  createSeedMember,
  pickRandom,
  shuffle,
  signModeFor,
  type Rng,
  type SeedMember,
  type SeedWorld,
  type SeededComment,
  type SeededPost,
} from "./seed-helpers.js";
import { ThreadRef } from "@oursay/identity/client";

/**
 * Pick a not-yet-used thread-specific comment for a post/target, else fall back to a generic root
 * comment. Mutates `used` so each `specificComments` entry is consumed at most once per thread.
 * Extracted so Phase 1b (author comments) and Phase 2 (secondary engagement) share one implementation.
 */
export function pickSeedComment(
  rng: Rng,
  slug: string,
  specificComments: string[] | undefined,
  used: Map<string, Set<number>>,
): string {
  if (specificComments?.length) {
    const taken = used.get(slug) ?? new Set<number>();
    const available = specificComments
      .map((text, idx) => ({ text, idx }))
      .filter((x) => !taken.has(x.idx));
    if (available.length > 0) {
      const pick = pickRandom(rng, available);
      taken.add(pick.idx);
      used.set(slug, taken);
      return pick.text;
    }
  }
  return pickRandom(rng, GENERIC_ROOT_COMMENTS);
}

const GENERATED_USER_COUNT = 14;

export interface SeedRunResult {
  members: Map<string, SeedMember>;
  people: SeedPerson[];
  posts: SeededPost[];
}

function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function weightedVisibility(rng: Rng): SeedVisibility {
  const total = GENERATED_VISIBILITY_MIX.reduce((n, x) => n + x.weight, 0);
  let roll = rng() * total;
  for (const entry of GENERATED_VISIBILITY_MIX) {
    roll -= entry.weight;
    if (roll <= 0) return entry.visibility;
  }
  return "anonymous";
}

function tierForVisibility(visibility: SeedVisibility, rng: Rng): 0 | 1 | 2 {
  if (visibility === "id_verified") return 1;
  if (visibility === "anonymous") return rng() > 0.4 ? 0 : 1;
  return 2;
}

function generatePeople(rng: Rng): SeedPerson[] {
  const used = new Set(SEED_ANCHORS.map((p) => p.handle));
  const people: SeedPerson[] = [...SEED_ANCHORS];

  for (let i = 0; i < GENERATED_USER_COUNT; i++) {
    const first = pickRandom(rng, FIRST_NAMES);
    const last = pickRandom(rng, LAST_NAMES);
    let handle = `${first}_${last}`.toLowerCase().replace(/[^a-z0-9_]/g, "");
    let n = 2;
    while (used.has(handle)) {
      handle = `${first}_${last}${n}`.toLowerCase();
      n++;
    }
    used.add(handle);

    const visibility = weightedVisibility(rng);
    const tier = tierForVisibility(visibility, rng);
    const inAlberta = visibility !== "id_verified" && rng() > 0.25;
    const districts = inAlberta && tier >= 2 ? [pickRandom(rng, DISTRICT_SLUGS)] : undefined;
    const jurisdictions = inAlberta ? [ALBERTA_ID] : undefined;

    people.push({
      handle,
      name: `${first} ${last}`,
      tier,
      visibility,
      districts,
      jurisdictions,
    });
  }
  return people;
}

function parentType(kind: PostKind): "post" | "petition" | "poll" {
  return kind === "statement" ? "post" : kind;
}

function canReactTo(post: SeededPost): boolean {
  return post.kind === "statement";
}

async function canAuthorPoll(
  world: SeedWorld,
  member: SeedMember,
  template: PostTemplate,
  jurisdiction: string,
): Promise<boolean> {
  if (template.kind !== "poll") return true;
  if (jurisdiction !== ALBERTA_ID) return true;
  // Alberta polls require the official role in ab-ca-gov (see gates.poll) — seat claims set this at claim time.
  return world.services.repos.membership.hasRole(member.userId, ALBERTA_ID, "official");
}

function resolveScope(template: PostTemplate, rng: Rng): string {
  if (template.scope === "generic") {
    return rng() > 0.55 ? ALBERTA_ID : jurisdictionForScope("global");
  }
  return jurisdictionForScope(template.scope);
}

export async function runSeedOrchestrator(world: SeedWorld, rng: Rng): Promise<SeedRunResult> {
  const people = generatePeople(rng);
  const members = new Map<string, SeedMember>();

  console.log(`Creating ${people.length} accounts…`);
  for (const person of people) {
    members.set(person.handle, await createSeedMember(world, person));
    process.stdout.write(".");
  }
  console.log(" done");

  console.log("Applying official seat claims…");
  await applySeedSeatClaims(world, people, members);
  console.log(" done");

  const posts: SeededPost[] = [];
  const comments: SeededComment[] = [];
  const postReactions = new Set<string>();
  const showcaseSlugs = new Set(SHOWCASE_BINDINGS.map((b) => b.slug));
  const templateBySlug = new Map(POST_TEMPLATES.map((t) => [t.slug, t]));
  const templates = shuffle(
    rng,
    POST_TEMPLATES.filter((t) => !showcaseSlugs.has(t.slug)),
  );
  const templateQueue = [...templates];
  const specificCommentUsed = new Map<string, Set<number>>();

  async function takeTemplate(
    member: SeedMember,
  ): Promise<{ template: PostTemplate; jurisdiction: string } | undefined> {
    for (let i = 0; i < templateQueue.length; i++) {
      const t = templateQueue[i]!;
      const jurisdiction = resolveScope(t, rng);
      if (!(await canAuthorPoll(world, member, t, jurisdiction))) continue;
      templateQueue.splice(i, 1);
      return { template: t, jurisdiction };
    }
    return undefined;
  }

  function threadRef(post: SeededPost): ThreadRef {
    return { threadId: post.id, jurisdiction: post.jurisdiction };
  }

  // Phase 0 — guaranteed UI showcase: AB province-wide, single-district, and multi-district stakes.
  console.log("Phase 0: district showcase posts…");
  for (const binding of SHOWCASE_BINDINGS) {
    const template = templateBySlug.get(binding.slug);
    const author = members.get(binding.author);
    if (!template || !author) {
      throw new Error(`showcase binding missing: ${binding.slug} / ${binding.author}`);
    }
    const jurisdiction = jurisdictionForScope(template.scope);
    posts.push(
      await createPostFromTemplate(author, template, seedUuid(template.slug), jurisdiction),
    );
    process.stdout.write(".");
  }
  console.log(" done");

  function reactionKey(handle: string, postId: string): string {
    return `${handle}:${postId}`;
  }

  async function addPostReaction(
    member: SeedMember,
    personHandle: string,
    post: SeededPost,
    kind: "check" | "cross",
  ): Promise<void> {
    if (!canReactTo(post)) return;
    const key = reactionKey(personHandle, post.id);
    if (postReactions.has(key)) return;
    const sign = signModeFor(post.jurisdiction);
    await member.client.ensureJoined(threadRef(post));
    await member.client.addReaction(
      threadRef(post),
      { type: parentType(post.kind), id: post.id },
      { kind },
      { sign },
    );
    postReactions.add(key);
  }

  // Phase 1 — each user creates 1–3 posts and adds agree reactions on others' posts.
  console.log("Phase 1: initial posts + agree reactions…");
  for (const person of people) {
    const member = members.get(person.handle)!;
    const postCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < postCount; i++) {
      const picked = await takeTemplate(member);
      if (!picked) break;
      const { template, jurisdiction } = picked;
      const id = seedUuid(template.slug);
      const post = await createPostFromTemplate(member, template, id, jurisdiction);
      posts.push(post);
    }

    const agreeTargets = shuffle(
      rng,
      posts.filter((p) => p.authorHandle !== person.handle && canReactTo(p)),
    ).slice(0, 1 + Math.floor(rng() * 3));
    for (const target of agreeTargets) {
      await addPostReaction(member, person.handle, target, "check");
    }
    process.stdout.write(".");
  }
  console.log(" done");

  // Phase 1b — post authors leave comments on their own threads (reply targets for phase 3).
  console.log("Phase 1b: author comments…");
  for (const post of posts) {
    const author = members.get(post.authorHandle);
    if (!author) continue;
    const sign = signModeFor(post.jurisdiction);
    const authorCommentCount = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < authorCommentCount; i++) {
      const body = pickSeedComment(rng, post.slug, post.specificComments, specificCommentUsed);
      await author.client.ensureJoined(threadRef(post));
      const ref = await author.client.createComment(
        threadRef(post),
        { type: parentType(post.kind), id: post.id },
        { body },
        { sign },
      );
      comments.push({
        id: ref.entityId,
        postId: post.id,
        authorHandle: post.authorHandle,
        parentType: "post",
      });
    }
    process.stdout.write(".");
  }
  console.log(" done");

  // Phase 2 — secondary engagement: reactions, comments, comment reactions, more posts.
  console.log("Phase 2: secondary engagement…");
  for (const person of people) {
    const member = members.get(person.handle)!;

    const reactionTargets = shuffle(
      rng,
      posts.filter((p) => p.authorHandle !== person.handle && canReactTo(p)),
    ).slice(0, Math.floor(rng() * 3) + 1);
    for (const target of reactionTargets) {
      await addPostReaction(member, person.handle, target, rng() > 0.25 ? "check" : "cross");
    }

    const commentTargets = shuffle(
      rng,
      posts.filter((p) => p.authorHandle !== person.handle),
    ).slice(0, Math.floor(rng() * 3) + 1);
    for (const target of commentTargets) {
      const sign = signModeFor(target.jurisdiction);
      const body = pickSeedComment(rng, target.slug, target.specificComments, specificCommentUsed);
      await member.client.ensureJoined(threadRef(target));
      const ref = await member.client.createComment(
        threadRef(target),
        { type: parentType(target.kind), id: target.id },
        { body },
        { sign },
      );
      comments.push({
        id: ref.entityId,
        postId: target.id,
        authorHandle: person.handle,
        parentType: "post",
      });
    }

    const commentReactionTargets = shuffle(rng, comments).slice(0, Math.floor(rng() * 5) + 1);
    const commentReactions = new Set<string>();
    for (const c of commentReactionTargets) {
      const reactKey = `${person.handle}:${c.id}`;
      if (commentReactions.has(reactKey)) continue;
      commentReactions.add(reactKey);
      const post = posts.find((p) => p.id === c.postId);
      if (!post) continue;
      const sign = signModeFor(post.jurisdiction);
      await member.client.ensureJoined(threadRef(post));
      await member.client.addReaction(
        threadRef(post),
        { type: "comment", id: c.id },
        { kind: rng() > 0.3 ? "check" : "cross" },
        { sign },
      );
    }

    const extraPosts = Math.floor(rng() * 3) + 1;
    for (let i = 0; i < extraPosts; i++) {
      const picked = await takeTemplate(member);
      if (!picked) break;
      const { template, jurisdiction } = picked;
      const id = seedUuid(`${template.slug}-x-${person.handle}-${i}`);
      posts.push(await createPostFromTemplate(member, template, id, jurisdiction));
    }
    process.stdout.write(".");
  }
  console.log(" done");

  // Phase 3 — each user replies to comments written by post authors.
  console.log("Phase 3: author-comment replies…");
  for (const person of people) {
    const member = members.get(person.handle)!;
    const authoredPosts = posts.filter((p) => p.authorHandle !== person.handle);
    const authorComments = comments.filter(
      (c) =>
        authoredPosts.some((p) => p.id === c.postId) &&
        posts.find((p) => p.id === c.postId)?.authorHandle === c.authorHandle,
    );
    const replyTargets = shuffle(rng, authorComments).slice(0, Math.min(3, authorComments.length));
    for (const c of replyTargets) {
      const post = posts.find((p) => p.id === c.postId);
      if (!post) continue;
      const sign = signModeFor(post.jurisdiction);
      const body = pickRandom(rng, GENERIC_REPLY_COMMENTS);
      await member.client.ensureJoined(threadRef(post));
      await member.client.createComment(
        threadRef(post),
        { type: "comment", id: c.id },
        { body },
        { sign },
      );
    }
    process.stdout.write(".");
  }
  console.log(" done");

  // Petition signatures and poll votes on a sample of posts.
  console.log("Phase 4: signatures + votes…");
  // AB residency/role gates legitimately block some voters — but a spike here can also be a real
  // gate regression, so we COUNT skips and surface the total rather than swallowing them silently.
  let voteGateSkips = 0;
  for (const post of posts) {
    if (post.kind === "petition") {
      const signers = shuffle(
        rng,
        people.filter((p) => p.handle !== post.authorHandle),
      ).slice(0, 3 + Math.floor(rng() * 4));
      for (const person of signers) {
        const member = members.get(person.handle)!;
        const sign = signModeFor(post.jurisdiction);
        await member.client.ensureJoined(threadRef(post));
        await member.client.append(
          threadRef(post),
          {
            op: "create",
            type: "petition_signature",
            entityId: randomUUID(),
            parent: { type: "petition", id: post.id },
            content: {},
          },
          { sign },
        );
      }
    }
    if (post.kind === "poll" && post.pollOptions?.length) {
      const voters = shuffle(
        rng,
        people.filter((p) => p.handle !== post.authorHandle && p.tier >= 1),
      ).slice(0, 2 + Math.floor(rng() * 3));
      for (const person of voters) {
        const member = members.get(person.handle)!;
        const sign = signModeFor(post.jurisdiction);
        const option = pickRandom(rng, post.pollOptions);
        await member.client.ensureJoined(threadRef(post));
        try {
          await member.client.castVote(
            threadRef(post),
            { type: "poll", id: post.id },
            { option },
            { sign },
          );
        } catch (e) {
          voteGateSkips++;
          if (process.env.SEED_VERBOSE) {
            console.warn(`\n  vote skipped (${person.handle} on ${post.slug}): ${(e as Error).message}`);
          }
        }
      }
    }
    process.stdout.write(".");
  }
  console.log(" done");
  if (voteGateSkips > 0) {
    console.log(`  → ${voteGateSkips} vote(s) skipped by gates (set SEED_VERBOSE=1 for per-vote reasons)`);
  }

  // Pad the civic outbox so the settlement worker can cut N full blocks in one go.
  // Default N=2 matches EVM_ANCHOR_EVERY_BLOCKS=2 — after two settles, maybePublish flushes to EVM.
  await padForSettlementBlocks(world, members, people, rng);

  return { members, people, posts };
}

/**
 * Ensure `record_outbox` has at least `SEED_SETTLE_BLOCKS * BLOCK_MAX_TXS` rows (defaults 2×250)
 * by appending filler posts. Without this, a typical seed (~330 txs) only settles one 250-tx block
 * and leaves a remainder below the count trigger — EVM (every 2 blocks) never publishes.
 */
async function padForSettlementBlocks(
  world: SeedWorld,
  members: Map<string, SeedMember>,
  people: SeedPerson[],
  rng: Rng,
): Promise<void> {
  const maxBlockTxs = Math.max(
    1,
    Number(process.env.BLOCK_MAX_TXS ?? process.env.BLOCK_MAX_PENDING ?? "250") || 250,
  );
  const settleBlocks = Math.max(1, Number(process.env.SEED_SETTLE_BLOCKS ?? "2") || 2);
  const targetTxs = maxBlockTxs * settleBlocks;

  const { rows } = await world.db.pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM record_outbox`,
  );
  let n = Number(rows[0]?.n ?? 0);
  if (n >= targetTxs) {
    console.log(
      `Phase 5: settlement pad skipped — already ${n} outbox tx (≥ ${targetTxs} for ${settleBlocks}×${maxBlockTxs})`,
    );
    return;
  }

  const authors = people.filter((p) => (p.jurisdictions ?? []).includes(ALBERTA_ID));
  const authorMembers = authors
    .map((p) => members.get(p.handle))
    .filter((m): m is SeedMember => m != null);
  if (authorMembers.length === 0) {
    throw new Error("Phase 5: no Alberta authors available to pad settlement blocks");
  }

  const need = targetTxs - n;
  console.log(
    `Phase 5: padding ${need} filler post(s) → ${targetTxs} outbox tx (${settleBlocks} blocks × ${maxBlockTxs})…`,
  );

  let i = 0;
  while (n < targetTxs) {
    const member = pickRandom(rng, authorMembers);
    const entityId = randomUUID();
    const template: PostTemplate = {
      slug: `settle-pad-${i}`,
      kind: "statement",
      title: `Settlement pad #${i + 1}`,
      body: `Filler post so the worker can settle ${settleBlocks} blocks and touch EVM.`,
      scope: "alberta",
    };
    await createPostFromTemplate(member, template, entityId, ALBERTA_ID);
    n++;
    i++;
    if (i % 25 === 0) process.stdout.write(".");
  }
  console.log(` done (${i} added, outbox=${n})`);
}

export const defaultSeedRng = mulberry32(0x05eed202);
