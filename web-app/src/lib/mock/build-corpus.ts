import type {
  ActivityItem,
  CommentNode,
  DistrictDetail,
  FeedItem,
  JurisdictionSummary,
  MentionItem,
  ProfileSupport,
  PublicProfile,
  RecordDetail,
  RecordKind,
  ActivityKind,
  SignTier,
} from "@/lib/types";
import { ALBERTA_ID, GLOBAL_ID, toCanonical } from "@/lib/types";
import { JURISDICTION_GATES, deriveSignTier } from "./gates";
import { ALBERTA_RIDINGS } from "./alberta-ridings";
import { countCommentNodes, hashSeed } from "./comment-utils";
import {
  COMMENTS_PETITION,
  COMMENTS_POLL,
  COMMENTS_RESULT,
  COMMENTS_STATEMENT,
  POST_PETITION,
  POST_POLL,
  POST_RESULT,
  POST_STATEMENT,
  RIVER_PATH_QUESTION,
  type PostTypeEntry,
} from "./details";
import { MY_HANDLE } from "./constants";
import { PEOPLE_BY_HANDLE, person, personDistricts } from "./people";
import {
  ALEX_MORGAN_PROFILE,
  PREMIER_PROFILE,
  RAE_NGUYEN_PROFILE,
} from "./profiles-seed";
import { mockRoleLine, mockRoleTagsFor } from "./role-tags";
import { WIREFRAME_POSTS } from "./wireframe-posts";

/** Hand-crafted record id -> comment thread (wireframe samples). */
const HAND_CRAFTED_COMMENTS: Record<string, CommentNode[]> = {
  [POST_STATEMENT.id]: COMMENTS_STATEMENT,
  [POST_PETITION.id]: COMMENTS_PETITION,
  [POST_POLL.id]: COMMENTS_POLL,
  [POST_RESULT.id]: COMMENTS_RESULT,
};

/** Hand-crafted record detail overrides (full detail fields). */
const HAND_CRAFTED_DETAILS: Record<string, RecordDetail> = {
  [POST_STATEMENT.id]: POST_STATEMENT,
  [POST_PETITION.id]: POST_PETITION,
  [POST_POLL.id]: POST_POLL,
  [POST_RESULT.id]: POST_RESULT,
};

const COMMENT_POOL = [
  "samd", "priya", "mlee", "hanao", "rosak", "weichen", "jvance", "pshah",
  "dfriesen", "kevinTO", "sarahbc", "marieqc", "lenapark", "tomberg", "premier",
];

const COMMENT_LINES = [
  ["This affects my neighbourhood directly."],
  ["Has anyone heard back from the ministry?"],
  ["Worth pushing to the next budget cycle."],
  ["I'd support this if the environmental review is public."],
  ["Our riding needs more detail before we commit."],
  ["Sharing this with my community league."],
  ["Good to see cross-riding coordination on this."],
  ["Can we get a timeline on implementation?"],
];

function isoDaysAgo(days: number): string {
  const d = new Date("2026-06-30T09:41:00");
  d.setDate(d.getDate() - days);
  d.setHours(9 + (days % 8), (days * 11) % 60, 0, 0);
  return d.toISOString().slice(0, 19);
}

function collectCommentHandles(nodes: CommentNode[], into: Set<string>): void {
  for (const node of nodes) {
    into.add(node.handle);
    collectCommentHandles(node.replies, into);
  }
}

function generateComments(postId: string): CommentNode[] {
  const seed = hashSeed(postId);
  const topCount = 2 + (seed % 4);
  const nodes: CommentNode[] = [];

  for (let i = 0; i < topCount; i++) {
    const handle = COMMENT_POOL[(seed + i * 3) % COMMENT_POOL.length];
    const p = person(handle);
    const line = COMMENT_LINES[(seed + i) % COMMENT_LINES.length];
    const node: CommentNode = {
      author: p.name,
      handle: p.handle,
      tier: p.tier,
      official: p.official,
      districts: personDistricts(p.handle),
      ts: isoDaysAgo(1 + ((seed + i) % 12)),
      body: line,
      up: 2 + ((seed + i * 5) % 20),
      down: i % 3,
      _my: null,
      replies: [],
    };

    if (i % 2 === 0) {
      const rHandle = COMMENT_POOL[(seed + i * 5 + 1) % COMMENT_POOL.length];
      const r = person(rHandle);
      node.replies = [
        {
          author: r.name,
          handle: r.handle,
          tier: r.tier,
          official: r.official,
          districts: personDistricts(r.handle),
          ts: isoDaysAgo((seed + i) % 8),
          body: ["Thanks — I'll follow this thread."],
          up: 1 + ((seed + i) % 8),
          down: 0,
          _my: null,
          replies: [],
        },
      ];
    }
    nodes.push(node);
  }
  return nodes;
}

/**
 * Stamp the author's home ridings (their residence, from the people registry)
 * onto a record. Kept separate from `districts` — the area the post AFFECTS —
 * so author-row glyphs and the My Jurisdiction filter read actual residence.
 * Also fills `official` from the people registry when the row omitted it.
 */
function withAuthorDistricts<T extends { handle: string; official?: boolean }>(
  item: T,
): T & { authorDistricts: string[] } {
  const p = person(item.handle);
  return {
    ...item,
    authorDistricts: personDistricts(item.handle),
    ...(item.official == null && p.official ? { official: true } : null),
  };
}

/**
 * Reconcile a row's signTier with its jurisdiction's sign floor (M8): a row can
 * never sit BELOW the floor its jurisdiction mandates for that root type (an AB
 * ledger-final statement/petition/poll is passkey-signed ⇒ ≥1), while a
 * hand-set opt-up above the floor is preserved.
 */
function withDerivedSignTier<
  T extends { jurisdiction: string; kind: RecordKind; signTier?: SignTier },
>(item: T): T {
  return {
    ...item,
    signTier: deriveSignTier(item.jurisdiction, toCanonical(item.kind), item.signTier),
  };
}

function feedToDetail(item: FeedItem): RecordDetail {
  const crafted = HAND_CRAFTED_DETAILS[item.id];
  if (crafted) return withDerivedSignTier(withAuthorDistricts(crafted));

  const seed = hashSeed(item.id);
  return {
    id: item.id,
    kind: item.kind,
    jurisdiction: item.jurisdiction,
    tier: item.tier,
    official: item.official,
    districts: item.districts,
    authorDistricts: item.authorDistricts ?? personDistricts(item.handle),
    author: item.author,
    handle: item.handle,
    title: item.title,
    body: item.body,
    ts: isoDaysAgo(2 + (seed % 20)),
    edits: item.edits ?? 0,
    signTier: item.signTier,
    up: item.up,
    down: item.down,
    sig: item.sig,
    goal: item.goal,
    options: item.options,
    attachedPoll: item.attachedPoll,
    _my: null,
    _vote: item.kind === "poll" ? null : undefined,
    sourcePetition: item.id === POST_POLL.id ? true : undefined,
    sourcePoll: item.id === POST_RESULT.id ? true : undefined,
    resultPublished: item.id === POST_POLL.id ? true : undefined,
  };
}

/** Every third riding slug — the named ridings for the rural-broadband petition. */
const BROADBAND_DISTRICTS = ALBERTA_RIDINGS.filter((_, i) => i % 3 === 0).map((r) => r.slug);
const BROADBAND_COUNT = BROADBAND_DISTRICTS.length;

function buildExtraPosts(): FeedItem[] {
  const extras: FeedItem[] = [];

  extras.push({
    id: "pet-rural-broadband",
    kind: "petition",
    jurisdiction: ALBERTA_ID,
    tier: 2,
    districts: BROADBAND_DISTRICTS,
    author: "Sarah Okamoto",
    handle: "sarahbc",
    title: "Fund rural broadband across named Alberta ridings",
    body: [
      `${BROADBAND_COUNT} ridings still lack reliable fibre backhaul.`,
      "Commit matching funds so every named riding can bid this cycle.",
    ],
    sig: 4200,
    goal: 10000,
    comments: 0,
    signTier: 1,
  });

  // In-jurisdiction (map-pinned) feed demo: Bea lives in calgary-elbow but
  // posts about the Edmonton corridor — an Alberta resident OUTSIDE the post's
  // affected area, so her author pill resolves "jurisdiction" for everyone.
  extras.push({
    id: "stmt-bea-trail-standard",
    kind: "statement",
    jurisdiction: ALBERTA_ID,
    tier: 2,
    districts: ["edmonton-strathcona", "edmonton-city-centre"],
    author: "Bea Nowak",
    handle: "beanowak",
    title: "Calgary is watching the river-path debate — set a provincial trail standard",
    body: [
      "The Edmonton corridor fight will repeat in every river city.",
      "Whatever gets funded there should become the provincial template.",
    ],
    up: 19,
    down: 3,
    comments: 0,
    signTier: 1,
  });

  extras.push({
    id: "stmt-kevin-transit",
    kind: "statement",
    jurisdiction: GLOBAL_ID,
    tier: 1,
    districts: [],
    author: "Kevin O'Brien",
    handle: "kevinTO",
    title: "Toronto–Calgary rail should be a federal priority too",
    body: [
      "Alberta's corridor posts keep surfacing the same gap.",
      "A national standard would help provinces plan together.",
    ],
    up: 34,
    down: 9,
    comments: 0,
  });

  extras.push({
    id: "stmt-marieqc-lang",
    kind: "statement",
    jurisdiction: GLOBAL_ID,
    tier: 1,
    districts: [],
    author: "Marie Dubois",
    handle: "marieqc",
    title: "Bilingual civic tools matter for cross-province platforms",
    body: [
      "OurSay should ship French UI before expanding provincial pilots.",
      "Quebec members shouldn't be second-class readers.",
    ],
    up: 41,
    down: 6,
    comments: 0,
  });

  for (const riding of ALBERTA_RIDINGS) {
    if (riding.slug === "edmonton-strathcona") continue;
    extras.push({
      id: `stmt-mla-${riding.slug}`,
      kind: "statement",
      jurisdiction: ALBERTA_ID,
      tier: 2,
      official: true,
      districts: [riding.slug],
      author: riding.mla.name,
      handle: riding.mla.handle,
      title: `${riding.name}: constituency office hours this month`,
      body: [
        `Drop in to discuss local priorities for ${riding.name}.`,
        "Bring questions on the provincial budget and local capital projects.",
      ],
      up: 12 + (hashSeed(riding.slug) % 80),
      down: hashSeed(riding.slug) % 15,
      comments: 0,
      signTier: riding.slug.startsWith("calgary") ? 1 : undefined,
    });
  }

  const residentRidings = ALBERTA_RIDINGS.filter((_, i) => i % 7 === 2);
  for (const riding of residentRidings) {
    const handle = `resident-${riding.slug.slice(0, 10)}`;
    if (!PEOPLE_BY_HANDLE[handle]) {
      PEOPLE_BY_HANDLE[handle] = {
        name: `Resident ${riding.name.split("-")[0]}`,
        handle,
        tier: 2,
        districts: [riding.slug],
        role: riding.name,
        // District pages de-anonymize in a wave when the viewer verifies residency.
        visibility: "my_jurisdiction",
      };
    }
    const p = PEOPLE_BY_HANDLE[handle];
    extras.push({
      id: `stmt-res-${riding.slug}`,
      kind: "statement",
      jurisdiction: ALBERTA_ID,
      tier: p.tier,
      official: p.official,
      districts: [riding.slug],
      author: p.name,
      handle: p.handle,
      title: `Fix the main street crossing in ${riding.name}`,
      body: [
        "The crossing near the school needs a proper signal.",
        "It's been on the ward list for two years.",
      ],
      up: 8 + (hashSeed(riding.slug + "res") % 40),
      down: hashSeed(riding.slug + "res") % 8,
      comments: 0,
    });
  }

  return extras;
}

function buildAllFeedItems(): FeedItem[] {
  return [...WIREFRAME_POSTS, ...buildExtraPosts()]
    .map(withAuthorDistricts)
    .map(withDerivedSignTier);
}

function buildRecordEntries(
  feedItems: FeedItem[],
  profilePosts: FeedItem[],
): Map<string, PostTypeEntry> {
  const map = new Map<string, PostTypeEntry>();
  const allItems = [...feedItems, ...profilePosts];

  for (const item of allItems) {
    const comments =
      HAND_CRAFTED_COMMENTS[item.id] ?? generateComments(item.id);
    map.set(item.id, { post: feedToDetail(item), comments });
  }

  for (const detail of [POST_POLL, POST_RESULT]) {
    if (map.has(detail.id)) continue;
    map.set(detail.id, {
      post: withDerivedSignTier(withAuthorDistricts(detail)),
      comments: HAND_CRAFTED_COMMENTS[detail.id] ?? generateComments(detail.id),
    });
  }

  return map;
}

function syncCommentCounts(
  items: FeedItem[],
  records: Map<string, PostTypeEntry>,
): FeedItem[] {
  return items.map((item) => ({
    ...item,
    comments: countCommentNodes(records.get(item.id)?.comments ?? []),
  }));
}

function truncateTitle(title: string, max = 42): string {
  if (title.length <= max) return title;
  return `${title.slice(0, max)}…`;
}

const REL_TIME_LABELS = ["1d", "2d", "3d", "4d", "5d", "6d", "1w", "2w", "3w"];

function relMeta(days: number): string {
  return REL_TIME_LABELS[days % REL_TIME_LABELS.length];
}

function activityMeta(days: number, jurisdictionId: string): Pick<ActivityItem, "meta" | "jurisdictionId"> {
  return { meta: relMeta(days), jurisdictionId };
}

function activityKindForPost(kind: FeedItem["kind"]): ActivityKind | null {
  if (kind === "result") return "statement";
  return kind;
}

function generateProfileActivity(
  handle: string,
  posts: FeedItem[],
  feedItems: FeedItem[],
): ActivityItem[] {
  const seed = hashSeed(`${handle}:activity`);
  const items: ActivityItem[] = [];
  const pool = feedItems.filter((p) => p.handle !== handle);

  for (let i = 0; i < Math.min(posts.length, 2); i++) {
    const p = posts[i];
    const kind = activityKindForPost(p.kind);
    if (!kind) continue;
    items.push({
      kind,
      text: `Posted “${truncateTitle(p.title)}”`,
      ...activityMeta(i + 1, p.jurisdiction),
      recordId: p.id,
    });
  }

  const templates: {
    kind: ActivityKind;
    text: (p: FeedItem) => string;
    icon?: string;
  }[] = [
    { kind: "comment", text: (p) => `Commented on “${truncateTitle(p.title)}”` },
    { kind: "comment", text: (p) => `Replied on “${truncateTitle(p.title)}”` },
    {
      kind: "comment",
      icon: "#ic-edit",
      text: (p) => `Edited a comment on “${truncateTitle(p.title)}”`,
    },
    { kind: "petition", text: (p) => `Signed “${truncateTitle(p.title)}”` },
    { kind: "poll", text: (p) => `Voted in “${truncateTitle(p.title)}”` },
    { kind: "reaction", icon: "#ic-check", text: (p) => `Agreed with “${truncateTitle(p.title)}”` },
    { kind: "reaction", icon: "#ic-x", text: (p) => `Disagreed with “${truncateTitle(p.title)}”` },
    {
      kind: "reaction",
      text: (p) => `Changed reaction on “${truncateTitle(p.title)}”`,
    },
    {
      kind: "statement",
      icon: "#ic-edit",
      text: (p) => `Edited “${truncateTitle(p.title)}”`,
    },
  ];

  const extraCount = 3 + (seed % 5);
  for (let i = 0; i < extraCount && pool.length > 0; i++) {
    const p = pool[(seed + i * 7) % pool.length];
    const t = templates[(seed + i * 3) % templates.length];
    items.push({
      kind: t.kind,
      icon: t.icon,
      text: t.text(p),
      ...activityMeta((seed + i) % REL_TIME_LABELS.length, p.jurisdiction),
      recordId: p.id,
    });
  }

  return items.slice(0, 12);
}

function generateProfileMentions(
  handle: string,
  feedItems: FeedItem[],
): MentionItem[] {
  const seed = hashSeed(`${handle}:mentions`);
  const count = 1 + (seed % 4);
  const authors = COMMENT_POOL.filter((h) => h !== handle);
  if (authors.length === 0 || feedItems.length === 0) return [];

  const mentionTexts = [
    `@${handle} can you weigh in on this?`,
    `Thanks @${handle} for raising this`,
    `@${handle} what's the timeline here?`,
    `Grateful for @${handle}'s work on this`,
    `@${handle} — any update from your office?`,
  ];

  const items: MentionItem[] = [];
  for (let i = 0; i < count; i++) {
    const authorHandle = authors[(seed + i * 2) % authors.length];
    const p = person(authorHandle);
    const post = feedItems[(seed + i * 5) % feedItems.length];
    items.push({
      author: p.name,
      handle: authorHandle,
      text: mentionTexts[(seed + i) % mentionTexts.length],
      meta: `on “${truncateTitle(post.title)}” · ${relMeta(i + 1)}`,
      recordId: post.id,
    });
  }
  return items;
}

function buildDistrictMap(): Record<string, DistrictDetail> {
  const map: Record<string, DistrictDetail> = {};
  for (const riding of ALBERTA_RIDINGS) {
    map[riding.slug] = {
      name: riding.name,
      slug: riding.slug,
      jur: ALBERTA_ID,
      leader: riding.mla.name,
      leaderHandle: riding.mla.seatHandle,
      boundaryYear: 2019,
      source: "Elections Alberta",
      about: [
        "Part of Alberta — OurSay's provincial (ladder) rules apply.",
        "District-scoped posts use appliesToRegion: district.",
        "Platform counts include residency-verified residents only.",
        "Boundary: 2019 revision (Elections Alberta).",
        "Membership is inferred from your address, never stored.",
      ],
    };
  }
  return map;
}

function buildJurData(): Record<string, JurisdictionSummary> {
  return {
    [GLOBAL_ID]: {
      id: GLOBAL_ID,
      slug: "global",
      name: "Global",
      level: "global",
      leader: {
        name: "OurSay Stewards",
        handle: "global-platform",
        claimed: true,
        claimedUserHandle: "oursay",
        leaderRole: "platform",
      },
      gates: JURISDICTION_GATES[GLOBAL_ID],
      rules: [
        "Open policy — any member may post any root type.",
        "Statements, Petitions and Polls are open to all.",
        "Verified posts are written to the public ledger.",
        "Unverified posts stay off-ledger.",
        "Counts appear once past the k-anonymity floor.",
      ],
      districtLabel: null,
      districts: [],
    },
    [ALBERTA_ID]: {
      id: ALBERTA_ID,
      slug: "alberta",
      name: "Alberta",
      level: "province",
      // Fictional demo leader — real officials are never claimed demo accounts.
      leader: {
        name: "Hon. A. Premier",
        handle: "ab-premier",
        claimed: true,
        claimedUserHandle: "premier",
        leaderRole: "premier",
      },
      gates: JURISDICTION_GATES[ALBERTA_ID],
      rules: [
        "Ladder policy — levels graduate upward.",
        "Statements: open to any registered member (passkey optional; ask by default).",
        "Petitions: residency-verified authors only (passkey-signed).",
        "Polls: officials, accredited media, or platform admins (or via petition→poll graduation).",
        "Verified actions are written on-ledger.",
        "Platform counts: residency-verified residents only.",
      ],
      districtLabel: "Ridings",
      districts: ALBERTA_RIDINGS.map((r) => ({
        name: r.name,
        slug: r.slug,
        leader: r.mla.name,
        leaderHandle: r.mla.seatHandle,
      })),
    },
  };
}

const BIO_TEMPLATES = [
  "Local voice focused on transit, parks, and everyday services.",
  "Here to listen, share updates, and push for practical change.",
  "Community-minded and always up for a good policy debate.",
  "Following the issues that shape our riding day to day.",
  "Bringing neighbourhood concerns into the wider conversation.",
];

/** Rough, seeded account age for the support-bar caption ("over M …"). */
function profileAgeLabel(handle: string): string {
  const seed = hashSeed(`${handle}:age`);
  const bucket = seed % 3;
  if (bucket === 0) {
    const weeks = 3 + (seed % 8);
    return `${weeks} weeks`;
  }
  if (bucket === 1) {
    const months = 2 + (seed % 10);
    return `${months} months`;
  }
  const years = 1 + (seed % 6);
  return `${years} ${years === 1 ? "year" : "years"}`;
}

function generateBio(handle: string, role: string): string {
  if (role.startsWith("MLA")) {
    return `${role}. Working on local priorities and open to your questions.`;
  }
  return BIO_TEMPLATES[hashSeed(`${handle}:bio`) % BIO_TEMPLATES.length];
}

/**
 * Aggregate agree/disagree + content totals for the profile support bar. Agrees
 * and disagrees come from the member's public statements plus a seeded comment
 * contribution (per-user comment authorship isn't modelled in the corpus).
 */
function computeProfileSupport(handle: string, posts: FeedItem[]): ProfileSupport {
  const statementPosts = posts.filter((p) => p.kind === "statement");
  let agrees = 0;
  let disagrees = 0;
  for (const p of statementPosts) {
    agrees += p.up ?? 0;
    disagrees += p.down ?? 0;
  }
  const comments = 4 + (hashSeed(`${handle}:cmts`) % 60);
  agrees += comments * (3 + (hashSeed(`${handle}:cup`) % 14));
  disagrees += comments * (1 + (hashSeed(`${handle}:cdn`) % 4));
  return { agrees, disagrees, statements: statementPosts.length, comments };
}

function buildProfiles(
  records: Map<string, PostTypeEntry>,
  feedItems: FeedItem[],
): Record<string, PublicProfile> {
  const byHandle: Record<string, PublicProfile> = {
    raenguyen: RAE_NGUYEN_PROFILE,
    premier: PREMIER_PROFILE,
    [MY_HANDLE]: ALEX_MORGAN_PROFILE,
  };

  const postsByHandle = new Map<string, FeedItem[]>();
  for (const item of feedItems) {
    const list = postsByHandle.get(item.handle) ?? [];
    list.push(item);
    postsByHandle.set(item.handle, list);
  }

  for (const riding of ALBERTA_RIDINGS) {
    const handle = riding.mla.handle;
    if (byHandle[handle]) continue;
    const posts = (postsByHandle.get(handle) ?? []).slice(0, 6);
    byHandle[handle] = {
      name: riding.mla.name,
      handle,
      role: `MLA · ${riding.name}`,
      roles: mockRoleTagsFor(handle, {
        name: riding.mla.name,
        handle,
        tier: 2,
      official: true,
        districts: [riding.slug],
        role: `MLA · ${riding.name}`,
      }),
      tier: 2,
      official: true,
      bio: generateBio(handle, `MLA · ${riding.name}`),
      ageLabel: profileAgeLabel(handle),
      support: computeProfileSupport(handle, posts),
      posts,
      activity: generateProfileActivity(handle, posts, feedItems),
      mentions: generateProfileMentions(handle, feedItems),
    };
  }

  // Every author or commenter anywhere in the corpus needs a resolvable
  // profile so no revealed author link dangles ("no broken link"). Anonymous
  // accounts still render as a per-thread persona and route to /persona — and
  // getProfile's visibility gate keeps these generated profiles hidden for
  // them — but any author the viewer *can* reveal now has a real page.
  const corpusHandles = new Set<string>();
  for (const item of feedItems) corpusHandles.add(item.handle);
  for (const entry of records.values()) {
    corpusHandles.add(entry.post.handle);
    collectCommentHandles(entry.comments, corpusHandles);
  }

  for (const handle of corpusHandles) {
    if (byHandle[handle]) continue;
    const p = person(handle);
    const posts = postsByHandle.get(handle) ?? [];
    byHandle[handle] = {
      name: p.name,
      handle,
      role: p.role ?? mockRoleLine(mockRoleTagsFor(handle, p)),
      roles: mockRoleTagsFor(handle, p),
      tier: p.tier,
      official: p.official,
      bio: generateBio(handle, p.role ?? "Member"),
      ageLabel: profileAgeLabel(handle),
      support: computeProfileSupport(handle, posts),
      posts,
      activity: generateProfileActivity(handle, posts, feedItems),
      mentions: generateProfileMentions(handle, feedItems),
    };
  }

  return byHandle;
}

const PROFILE_ONLY_POSTS: FeedItem[] = [
  ...RAE_NGUYEN_PROFILE.posts,
  ...ALEX_MORGAN_PROFILE.posts,
].map(withAuthorDistricts).map(withDerivedSignTier);
const RAW_FEED = buildAllFeedItems();
const RECORD_BY_ID = buildRecordEntries(RAW_FEED, PROFILE_ONLY_POSTS);
export const POSTS = syncCommentCounts(RAW_FEED, RECORD_BY_ID);

export const PROFILES_BY_HANDLE = (() => {
  const profiles = buildProfiles(RECORD_BY_ID, POSTS);
  profiles.raenguyen = {
    ...profiles.raenguyen,
    posts: syncCommentCounts(
      RAE_NGUYEN_PROFILE.posts.map(withAuthorDistricts),
      RECORD_BY_ID,
    ),
  };
  profiles[MY_HANDLE] = {
    ...profiles[MY_HANDLE],
    posts: syncCommentCounts(
      ALEX_MORGAN_PROFILE.posts.map(withAuthorDistricts),
      RECORD_BY_ID,
    ),
  };
  return profiles;
})();

const PROFILES_BY_HANDLE_LOWER = Object.fromEntries(
  Object.entries(PROFILES_BY_HANDLE).map(([key, profile]) => [
    key.toLowerCase(),
    profile,
  ]),
);

export const DISTRICT_BY_SLUG = buildDistrictMap();
export const JUR_DATA = buildJurData();
export const DISTRICT_NAMES: Record<string, string> = Object.fromEntries(
  ALBERTA_RIDINGS.map((r) => [r.slug, r.name]),
);

export function districtName(slug: string): string {
  return DISTRICT_NAMES[slug] ?? slug;
}

/** All modelled jurisdiction ids (the JUR_DATA keys). */
export const ALL_JURISDICTIONS = Object.keys(JUR_DATA);

/** The summary for a jurisdiction id (undefined when unmodelled). */
export function jurisdictionById(id: string): JurisdictionSummary | undefined {
  return JUR_DATA[id];
}

/** Display label for a jurisdiction id (falls back to the id). */
export function jurisdictionLabel(id: string): string {
  return JUR_DATA[id]?.name ?? id;
}

/** Resolve a jurisdiction by its URL slug (e.g. "alberta" -> the summary). */
export function jurisdictionBySlug(slug: string): JurisdictionSummary | undefined {
  return Object.values(JUR_DATA).find((j) => j.slug === slug);
}

/** Jurisdiction id for a URL slug (undefined when unknown). */
export function jurisdictionIdFromSlug(slug: string): string | undefined {
  return jurisdictionBySlug(slug)?.id;
}

export const DISTRICT = DISTRICT_BY_SLUG["edmonton-strathcona"];
export const PROFILE = PROFILES_BY_HANDLE.raenguyen;

export const DETAIL_BY_ID: Record<string, PostTypeEntry> = Object.fromEntries(
  RECORD_BY_ID.entries(),
);

export const POST_TYPES: Record<RecordKind, PostTypeEntry> = {
  statement: DETAIL_BY_ID[POST_STATEMENT.id],
  petition: DETAIL_BY_ID[POST_PETITION.id],
  poll: DETAIL_BY_ID[POST_POLL.id],
  result: DETAIL_BY_ID[POST_RESULT.id],
};

export {
  POST_STATEMENT,
  POST_PETITION,
  POST_POLL,
  POST_RESULT,
  COMMENTS_STATEMENT,
  COMMENTS_PETITION,
  COMMENTS_POLL,
  COMMENTS_RESULT,
  RIVER_PATH_QUESTION,
};

export function getRecordEntry(id: string): PostTypeEntry | undefined {
  return DETAIL_BY_ID[id];
}

export function getProfileByHandle(handle: string): PublicProfile | undefined {
  return (
    PROFILES_BY_HANDLE[handle] ?? PROFILES_BY_HANDLE_LOWER[handle.toLowerCase()]
  );
}

export function getDistrictBySlug(slug: string): DistrictDetail | undefined {
  return DISTRICT_BY_SLUG[slug];
}

export const GRADUATION_CHAIN = {
  petition: POST_PETITION,
  poll: POST_POLL,
  result: POST_RESULT,
} as const;
