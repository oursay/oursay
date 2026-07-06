/**
 * Seed civic corpus ported from web-app mock wireframe + detail samples.
 */

import { createHash } from "node:crypto";
import { ALBERTA_ID, GLOBAL_ID } from "./people.js";

/** Deterministic UUID v4-shaped id per mock slug (record_tx.entity_id is UUID). */
export function seedUuid(slug: string): string {
  const hash = createHash("sha256").update(`oursay-seed-v1:${slug}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function rid(slug: string): string {
  return seedUuid(slug);
}

export type SeedKind = "statement" | "petition" | "poll" | "result";

export interface SeedComment {
  handle: string;
  body: string;
  replies?: SeedComment[];
}

export interface SeedRoot {
  /** Stable mock slug (wireframe id). */
  slug: string;
  id: string;
  kind: SeedKind;
  jurisdiction: string;
  author: string;
  title: string;
  body: string;
  districts?: string[];
  pollOptions?: string[];
  petitionRules?: { appliesToDistrictIds?: string[]; allowRevoke?: boolean };
  sourcePollId?: string;
  resultTallies?: { option: string; count: number }[];
  /** Post-create update (edit count demo). */
  updateBody?: string;
  comments?: SeedComment[];
  reactions?: Array<{ handle: string; kind: "check" | "cross" }>;
  signatures?: string[];
  /** One handle to revoke after signing (global petition demo). */
  revokeSignature?: string;
  votes?: Array<{ handle: string; option: string }>;
}

/** Hand-crafted comment trees from details.ts (abbreviated where generated suffices). */
const COMMENTS_HANA: SeedComment[] = [
  {
    handle: "samd",
    body: "Agreed — the rookery alone should trigger a review.",
    replies: [
      {
        handle: "raenguyen",
        body: "I've asked Parks to share the 2023 survey data.",
        replies: [
          { handle: "hanao", body: "Thank you — please post it here when you can." },
        ],
      },
    ],
  },
  {
    handle: "mlee",
    body: "What's the timeline on the rezoning vote?",
    replies: [{ handle: "priya", body: "Next council session, per the agenda." }],
  },
  { handle: "rosak", body: "Roads could be rerouted around the south edge instead." },
];

const COMMENTS_PETITION: SeedComment[] = [
  {
    handle: "lenapark",
    body: "City Centre residents feel this every commute — fully behind it.",
    replies: [{ handle: "weichen", body: "Thanks Lena — appreciate support from both sides of the path." }],
  },
  { handle: "samd", body: "One signature away from the threshold — let's push it over." },
  { handle: "owenf", body: "City Centre side backs this too — the pinch point is on our end of the path." },
  { handle: "beanowak", body: "Calgary elector here — happy to see it, though it's really an Edmonton corridor fix." },
];

/** ~12 root records incl. graduation chain + global samples. */
export const SEED_ROOTS: SeedRoot[] = [
  {
    slug: "stmt-dana-transit",
    id: rid("stmt-dana-transit"),
    kind: "statement",
    jurisdiction: GLOBAL_ID,
    author: "dwhitecloud",
    title: "Transit funding should be a national priority",
    body: "Inter-city rail keeps falling behind. A standing fund would let provinces plan past a single election cycle.",
    reactions: [
      { handle: "priya", kind: "check" },
      { handle: "mlee", kind: "check" },
    ],
  },
  {
    slug: "poll-oursay-rcv",
    id: rid("poll-oursay-rcv"),
    kind: "poll",
    jurisdiction: GLOBAL_ID,
    author: "oursay",
    title: "Should OurSay add ranked-choice polls?",
    body: "Ranked choice lets you order options instead of picking one. Worth the added complexity?",
    pollOptions: ["Yes", "No", "Unsure"],
    votes: [
      { handle: "priya", option: "Yes" },
      { handle: "mlee", option: "No" },
      { handle: "alex_morgan", option: "Yes" },
    ],
  },
  {
    slug: "pet-priya-oss",
    id: rid("pet-priya-oss"),
    kind: "petition",
    jurisdiction: GLOBAL_ID,
    author: "priya",
    title: "Open-source the public election software",
    body: "Code that counts votes should be auditable by anyone. Publish the source under an OSI licence.",
    petitionRules: { allowRevoke: true },
    signatures: ["mlee", "dwhitecloud", "oursay", "alex_morgan"],
    revokeSignature: "dwhitecloud",
    updateBody: "Code that counts votes should be auditable by anyone. Publish the source under an OSI licence. (clarified scope)",
  },
  {
    slug: "stmt-marcus-votingage",
    id: rid("stmt-marcus-votingage"),
    kind: "statement",
    jurisdiction: GLOBAL_ID,
    author: "mlee",
    title: "Lower the voting age to 16",
    body: "Sixteen-year-olds work, pay tax, and drive. They should have a say in the policies that shape their future.",
    reactions: [{ handle: "priya", kind: "cross" }],
  },
  {
    slug: "stmt-hana-ravine",
    id: rid("stmt-hana-ravine"),
    kind: "statement",
    jurisdiction: ALBERTA_ID,
    author: "hanao",
    title: "Protect the Whitemud Creek ravine",
    body: "The proposed access roads would cut directly through old-growth ravine that buffers the creek and shelters a heron rookery.",
    districts: ["edmonton-strathcona"],
    updateBody:
      "The proposed access roads would cut directly through old-growth ravine that buffers the creek and shelters a heron rookery. Council should pause the rezoning until an independent review of the watershed impact is complete.",
    comments: COMMENTS_HANA,
    reactions: [
      { handle: "samd", kind: "check" },
      { handle: "alex_morgan", kind: "check" },
    ],
  },
  {
    slug: "stmt-jordan-bikelanes",
    id: rid("stmt-jordan-bikelanes"),
    kind: "statement",
    jurisdiction: ALBERTA_ID,
    author: "jvance",
    title: "More bike lanes on Whyte Avenue",
    body: "Whyte gets dangerous at rush hour. Protected lanes would help everyone share the road.",
    districts: ["edmonton-strathcona"],
  },
  {
    slug: "stmt-priti-rink",
    id: rid("stmt-priti-rink"),
    kind: "statement",
    jurisdiction: ALBERTA_ID,
    author: "pshah",
    title: "Save the Elbow Park outdoor rink",
    body: "The community rink needs a small grant to reopen this winter. Let's fund it.",
    districts: ["calgary-elbow"],
  },
  {
    slug: "stmt-premier-budget",
    id: rid("stmt-premier-budget"),
    kind: "statement",
    jurisdiction: ALBERTA_ID,
    author: "premier",
    title: "Budget 2027 consultation now open",
    body: "Residents can weigh in on provincial priorities through the end of the month.",
  },
  {
    slug: "pet-wei-path",
    id: rid("pet-wei-path"),
    kind: "petition",
    jurisdiction: ALBERTA_ID,
    author: "weichen",
    title: "Twin the river-valley commuter path",
    body: "The river-valley path narrows to one lane right where the ridings meet, backing up commuters every morning.",
    districts: ["edmonton-strathcona", "edmonton-city-centre"],
    petitionRules: {
      appliesToDistrictIds: ["edmonton-strathcona", "edmonton-city-centre"],
      allowRevoke: false,
    },
    comments: COMMENTS_PETITION,
    signatures: ["samd", "owenf", "lenapark", "hanao", "alex_morgan"],
  },
  {
    slug: "poll-river-path",
    id: rid("poll-river-path"),
    kind: "poll",
    jurisdiction: ALBERTA_ID,
    author: "ableg",
    title: "Twin the river-valley path — fund it in 2027?",
    body: "Graduated from Wei Chen's petition after it passed the signature threshold.",
    pollOptions: ["Yes — fund it in 2027", "No — defer to a later budget"],
    votes: [
      { handle: "weichen", option: "Yes — fund it in 2027" },
      { handle: "samd", option: "Yes — fund it in 2027" },
      { handle: "hanao", option: "Yes — fund it in 2027" },
      { handle: "rosak", option: "No — defer to a later budget" },
    ],
  },
  {
    slug: "res-river-path",
    id: rid("res-river-path"),
    kind: "result",
    jurisdiction: ALBERTA_ID,
    author: "ableg",
    title: "Result: River-valley path twinning vote",
    body: "The province-wide poll has closed. Counts shown are residency-verified electors only.",
    sourcePollId: rid("poll-river-path"),
    resultTallies: [
      { option: "Yes — fund it in 2027", count: 3 },
      { option: "No — defer to a later budget", count: 1 },
    ],
  },
  {
    slug: "poll-ableg-budget",
    id: rid("poll-ableg-budget"),
    kind: "poll",
    jurisdiction: ALBERTA_ID,
    author: "ableg",
    title: "Provincial budget priority for 2027",
    body: "Where should the next provincial budget lead?",
    pollOptions: ["Healthcare", "Education", "Roads"],
    votes: [
      { handle: "hanao", option: "Healthcare" },
      { handle: "weichen", option: "Education" },
    ],
  },
];
