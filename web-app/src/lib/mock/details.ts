import type { CommentNode, RecordDetail, RecordKind } from "@/lib/types";

/**
 * Post-detail samples: one representative record per kind, plus its comment
 * thread (nested to depth 3). These are the wireframe's POST_STATEMENT /
 * POST_PETITION / POST_POLL / POST_RESULT + COMMENTS_* trees.
 *
 * The petition/poll/result form a graduation chain (a wireframe narrative):
 * Wei Chen's 2-riding petition graduates into a province-wide poll, which
 * publishes a province-wide result. Ids match the feed corpus where the same
 * record appears (stmt-hana-ravine, pet-wei-path).
 */

export const POST_STATEMENT: RecordDetail = {
  id: "stmt-hana-ravine",
  kind: "statement",
  author: "Hana Okafor",
  handle: "hanao",
  tier: 2,
  jurisdiction: "Alberta",
  districts: ["edmonton-strathcona"],
  ts: "2026-06-22T10:15:00", // >6d old -> shows the absolute date "2026-06-22"
  edits: 3,
  title: "Protect the Whitemud Creek ravine",
  body: [
    "The proposed access roads would cut directly through old-growth",
    "ravine that buffers the creek and shelters a heron rookery.",
    "Council should pause the rezoning until an independent review",
    "of the watershed impact is complete.",
  ],
  up: 132,
  down: 7,
  _my: null,
  signTier: 1,
};

export const COMMENTS_STATEMENT: CommentNode[] = [
  {
    author: "Sam Driver",
    handle: "samd",
    tier: 2,
    districts: ["edmonton-strathcona"],
    ts: "2026-06-27T09:00:00",
    edits: 1,
    body: ["Agreed — the rookery alone should trigger a review."],
    up: 14,
    down: 1,
    _my: null,
    signTier: 1,
    replies: [
      {
        author: "Rae Nguyen",
        handle: "raenguyen",
        tier: 3,
        ts: "2026-06-30T08:40:00",
        signTier: 2,
        body: ["I've asked Parks to share the 2023 survey data."],
        up: 9,
        down: 0,
        _my: null,
        replies: [
          {
            author: "Hana Okafor",
            handle: "hanao",
            tier: 2,
            districts: ["edmonton-strathcona"],
            ts: "2026-06-25T14:00:00",
            body: ["Thank you — please post it here when you can."],
            up: 4,
            down: 0,
            _my: null,
            signTier: 1,
            replies: [],
          },
        ],
      },
    ],
  },
  {
    author: "Marcus Lee",
    handle: "mlee",
    tier: 1,
    ts: "2026-06-20T11:30:00",
    body: ["What's the timeline on the rezoning vote?"],
    up: 3,
    down: 0,
    _my: null,
    replies: [
      {
        author: "Priya Anand",
        handle: "priya",
        tier: 1,
        ts: "2026-06-24T16:20:00",
        body: ["Next council session, per the agenda."],
        up: 5,
        down: 0,
        _my: null,
        signTier: 1,
        replies: [],
      },
    ],
  },
  {
    author: "Rosa Klein",
    handle: "rosak",
    tier: 2,
    districts: ["calgary-elbow"],
    ts: "2026-06-29T19:10:00",
    edits: 2,
    body: ["Roads could be rerouted around the south edge instead."],
    up: 6,
    down: 2,
    _my: null,
    signTier: 1,
    replies: [],
  },
];

/**
 * Shared short question — reused verbatim as the petition's attachedPoll.question,
 * the poll's own title, and every interlink preview.
 */
export const RIVER_PATH_QUESTION = "Twin the river-valley path — fund it in 2027?";

export const POST_PETITION: RecordDetail = {
  id: "pet-wei-path",
  kind: "petition",
  author: "Wei Chen",
  handle: "weichen",
  tier: 2,
  jurisdiction: "Alberta",
  districts: ["edmonton-strathcona", "edmonton-city-centre"],
  ts: "2026-06-18T08:00:00",
  edits: 0,
  title: "Twin the river-valley commuter path",
  body: [
    "The river-valley path narrows to one lane right where the",
    "ridings meet, backing up commuters every morning. Twinning",
    "it end to end lets both ridings share one continuous route",
    "— and it's shovel-ready this budget cycle.",
  ],
  sig: 7999,
  goal: 8000,
  signTier: 1,
  attachedPoll: {
    question: RIVER_PATH_QUESTION,
    options: ["Yes — fund it in 2027", "No — defer to a later budget"],
  },
};

export const COMMENTS_PETITION: CommentNode[] = [
  {
    author: "Lena Park",
    handle: "lenapark",
    tier: 3,
    districts: ["edmonton-city-centre"],
    ts: "2026-06-28T09:00:00",
    body: ["City Centre residents feel this every commute — fully behind it."],
    up: 22,
    down: 1,
    _my: null,
    signTier: 1,
    replies: [
      {
        author: "Wei Chen",
        handle: "weichen",
        tier: 2,
        districts: ["edmonton-strathcona"],
        ts: "2026-06-28T15:00:00",
        body: ["Thanks Lena — appreciate support from both sides of the path."],
        up: 6,
        down: 0,
        _my: null,
        replies: [],
      },
    ],
  },
  {
    author: "Sam Driver",
    handle: "samd",
    tier: 2,
    districts: ["edmonton-strathcona"],
    ts: "2026-06-29T11:00:00",
    body: ["One signature away from the threshold — let's push it over."],
    up: 18,
    down: 0,
    _my: null,
    signTier: 1,
    replies: [],
  },
  // Residency-glyph ladder demo (viewer home = edmonton-strathcona):
  //   samd / weichen -> home (map-pin-house, once residency-verified)
  //   owenf          -> affected: the petition's other affected riding (map-pin-check)
  //   beanowak       -> in-jurisdiction: Alberta, but outside the corridor (map-pinned)
  //   sarahbc        -> residency-verified, no local tie (plain map-pin)
  {
    author: "Owen Fletcher",
    handle: "owenf",
    tier: 2,
    districts: ["edmonton-city-centre"],
    ts: "2026-06-28T13:30:00",
    body: ["City Centre side backs this too — the pinch point is on our end of the path."],
    up: 15,
    down: 0,
    _my: null,
    signTier: 1,
    replies: [],
  },
  {
    author: "Bea Nowak",
    handle: "beanowak",
    tier: 2,
    districts: ["calgary-elbow"],
    ts: "2026-06-27T17:45:00",
    body: [
      "Calgary elector here — happy to see it, though it's really an Edmonton corridor fix.",
    ],
    up: 7,
    down: 1,
    _my: null,
    replies: [],
  },
  {
    author: "Sarah Okamoto",
    handle: "sarahbc",
    tier: 2,
    ts: "2026-06-26T20:10:00",
    body: ["We twinned a river path in Vancouver — the commute time drop was real."],
    up: 5,
    down: 0,
    _my: null,
    replies: [],
  },
  {
    author: "Marcus Lee",
    handle: "mlee",
    tier: 1,
    ts: "2026-06-25T10:00:00",
    body: ["Would love ranked funding-split options, not just yes/no."],
    up: 4,
    down: 2,
    _my: null,
    replies: [],
  },
];

export const POST_POLL: RecordDetail = {
  id: "poll-river-path",
  kind: "poll",
  author: "Alberta Assembly",
  handle: "ableg",
  tier: 3,
  jurisdiction: "Alberta",
  districts: [],
  ts: "2026-06-15T09:00:00",
  edits: 0,
  title: RIVER_PATH_QUESTION,
  body: [
    "Graduated from Wei Chen's petition after it passed the",
    "signature threshold. Open to residency-verified electors",
    "province-wide, since this draws on the general budget.",
  ],
  options: [
    { label: "Yes — fund it in 2027", v: 5413 },
    { label: "No — defer to a later budget", v: 1206 },
  ],
  _vote: null,
  signTier: 1,
  sourcePetition: true, // -> "Source Petition" collapsible, links back to POST_PETITION
  resultPublished: true, // -> "Result" collapsible + frames this poll as closed
};

export const COMMENTS_POLL: CommentNode[] = [
  {
    author: "Rosa Klein",
    handle: "rosak",
    tier: 2,
    districts: ["calgary-elbow"],
    ts: "2026-06-29T08:00:00",
    body: ["Glad to see this funded province-wide, not just the two ridings."],
    up: 14,
    down: 2,
    _my: null,
    replies: [],
  },
  {
    author: "Sam Driver",
    handle: "samd",
    tier: 2,
    districts: ["edmonton-strathcona"],
    ts: "2026-06-29T12:00:00",
    body: ["Voted yes — this was a long time coming."],
    up: 9,
    down: 0,
    _my: null,
    signTier: 1,
    replies: [],
  },
  {
    author: "Hon. A. Premier",
    handle: "premier",
    tier: 3,
    ts: "2026-06-29T18:00:00",
    body: ["Committing to this in the fall budget update."],
    up: 31,
    down: 4,
    _my: null,
    replies: [],
  },
];

export const POST_RESULT: RecordDetail = {
  id: "res-river-path",
  kind: "result",
  author: "Alberta Assembly",
  handle: "ableg",
  tier: 3,
  jurisdiction: "Alberta",
  districts: [],
  ts: "2026-06-30T07:00:00",
  edits: 0,
  title: "Result: River-valley path twinning vote",
  body: [
    "The province-wide poll has closed. Counts shown are",
    "residency-verified electors only, anchored on the",
    "public ledger — past the k-anonymity floor.",
  ],
  options: [
    { label: "Yes — fund it in 2027", v: 5413 },
    { label: "No — defer to a later budget", v: 1206 },
  ],
  up: 47,
  down: 6,
  _my: null,
  sourcePoll: true,
  sourcePetition: true, // transitive petition link, per result.md
};

export const COMMENTS_RESULT: CommentNode[] = [
  {
    author: "Wei Chen",
    handle: "weichen",
    tier: 2,
    districts: ["edmonton-strathcona"],
    ts: "2026-06-30T08:00:00",
    body: ["Thank you to everyone who signed and voted for this."],
    up: 26,
    down: 0,
    _my: null,
    signTier: 1,
    replies: [],
  },
  {
    author: "Tom Berg",
    handle: "tomberg",
    tier: 3,
    districts: ["calgary-elbow"],
    ts: "2026-06-30T08:30:00",
    body: ["Calgary-Elbow wants the same treatment for our pathways."],
    up: 11,
    down: 1,
    _my: null,
    replies: [],
  },
];

/** One representative detail-page sample per record kind (wireframe POST_TYPES). */
export interface PostTypeEntry {
  post: RecordDetail;
  comments: CommentNode[];
}

export const POST_TYPES: Record<RecordKind, PostTypeEntry> = {
  statement: { post: POST_STATEMENT, comments: COMMENTS_STATEMENT },
  petition: { post: POST_PETITION, comments: COMMENTS_PETITION },
  poll: { post: POST_POLL, comments: COMMENTS_POLL },
  result: { post: POST_RESULT, comments: COMMENTS_RESULT },
};
