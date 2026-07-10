/**
 * Authorless seed content — post templates and comment pools for the dev corpus.
 * Authors, reactions, and threading are assigned at runtime by seed-orchestrator.ts.
 */

import { createHash } from "node:crypto";
import type { EntityRules } from "@oursay/public-record/schema/types";
import { ALBERTA_ID, GLOBAL_ID } from "./people.js";

/** Deterministic UUID v4-shaped id per slug (record_tx.entity_id is UUID). */
export function seedUuid(slug: string): string {
  const hash = createHash("sha256").update(`oursay-seed-v2:${slug}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export type PostKind = "statement" | "petition" | "poll";
export type PostScope = "alberta" | "global" | "generic";

export interface PostTemplate {
  slug: string;
  kind: PostKind;
  scope: PostScope;
  title: string;
  body: string;
  pollOptions?: string[];
  /** Geographic stake for petitions/polls (→ feed `appliesToDistrictIds`). Statements are always jurisdiction-wide. */
  governance?: EntityRules;
  /** One-time root comments consumed when a user comments on this post. */
  specificComments?: string[];
}

/** Always seeded first with fixed authors — guarantees single/multi-district UI coverage. */
export const SHOWCASE_BINDINGS: readonly { slug: string; author: string }[] = [
  { slug: "gl-rcv-poll", author: "oursay" },
  { slug: "ab-province-wide", author: "whyte_public" },
  { slug: "ab-showcase-pet-single", author: "strathcona_local" },
  { slug: "ab-river-path", author: "centre_district" },
  { slug: "ab-showcase-poll-single", author: "ableg" },
  { slug: "ab-showcase-poll-multi", author: "ableg" },
];

export function jurisdictionForScope(scope: PostScope): string {
  if (scope === "alberta") return ALBERTA_ID;
  if (scope === "global") return GLOBAL_ID;
  return GLOBAL_ID;
}

/** Reusable root-level comments (any post). */
export const GENERIC_ROOT_COMMENTS: readonly string[] = [
  "Thanks for raising this — it needed to be said.",
  "Interested to see where this goes.",
  "Can you share more detail on the timeline?",
  "Fully support this direction.",
  "I have concerns, but appreciate the transparency.",
  "Has anyone from the city weighed in yet?",
  "This affects my commute every day.",
  "Worth a wider conversation.",
  "Glad this is on the record.",
  "Following along.",
  "Strong agree.",
  "What would success look like in a year?",
  "We tried something similar in 2019 — mixed results.",
  "Please tag your MLA when you share this.",
  "The environmental angle matters here too.",
];

/** Reusable replies (second pass — under an author's comment). */
export const GENERIC_REPLY_COMMENTS: readonly string[] = [
  "Good point — hadn't thought of it that way.",
  "That's fair.",
  "Can you expand on that?",
  "Agreed.",
  "I see it differently, but respect the take.",
  "Thanks for clarifying.",
  "This helped me understand the trade-offs.",
  "Same experience on my block.",
  "Worth bringing to the next community meeting.",
  "Noted — will read the linked report.",
];

export const POST_TEMPLATES: readonly PostTemplate[] = [
  // ── Alberta (showcase: province-wide + single-district + multi-district stakes) ──
  {
    slug: "ab-province-wide",
    kind: "statement",
    scope: "alberta",
    title: "Alberta should publish monthly ER wait-time dashboards",
    body: "Province-wide averages hide which facilities are struggling. Monthly facility-level reporting would help residents and MLAs alike.",
    specificComments: ["Other provinces already do this quarterly."],
  },
  {
    slug: "ab-showcase-pet-single",
    kind: "petition",
    scope: "alberta",
    title: "Restore the Whyte Avenue street trees",
    body: "Drought and construction took out a full block of mature elms. Replace them this planting season.",
    governance: {
      appliesToDistrictIds: ["edmonton-strathcona"],
      allowRevoke: true,
    },
    specificComments: ["The south sidewalk is bare for two full blocks."],
  },
  {
    slug: "ab-river-path",
    kind: "petition",
    scope: "alberta",
    title: "Twin the river-valley commuter path",
    body: "The path narrows to one lane where Edmonton-Strathcona meets Edmonton-City Centre, backing up cyclists and walkers every morning.",
    governance: {
      appliesToDistrictIds: ["edmonton-strathcona", "edmonton-city-centre"],
      allowRevoke: false,
    },
    specificComments: [
      "City Centre residents feel this every commute — fully behind it.",
      "One signature away from the threshold — let's push it over.",
    ],
  },
  {
    slug: "ab-showcase-poll-single",
    kind: "poll",
    scope: "alberta",
    title: "Fund a new Strathcona community rink in 2027?",
    body: "Single-riding poll — only Edmonton-Strathcona residents are in the impacted audience.",
    pollOptions: ["Yes — fund in 2027", "No — defer"],
    governance: { appliesToDistrictIds: ["edmonton-strathcona"] },
  },
  {
    slug: "ab-showcase-poll-multi",
    kind: "poll",
    scope: "alberta",
    title: "Fund the river-valley path twinning in 2027?",
    body: "Multi-riding poll spanning Strathcona and City Centre.",
    pollOptions: ["Yes — fund in 2027", "No — defer"],
    governance: {
      appliesToDistrictIds: ["edmonton-strathcona", "edmonton-city-centre"],
    },
  },
  {
    slug: "ab-ravine",
    kind: "statement",
    scope: "alberta",
    title: "Protect the Whitemud Creek ravine",
    body: "The proposed access roads would cut through old-growth buffer along the creek and disturb a heron rookery. Council should pause rezoning until an independent watershed review is complete.",
    specificComments: [
      "Agreed — the rookery alone should trigger a review.",
      "What's the timeline on the rezoning vote?",
      "Roads could be rerouted around the south edge instead.",
    ],
  },
  {
    slug: "ab-bike-lanes",
    kind: "statement",
    scope: "alberta",
    title: "Protected bike lanes on Whyte Avenue",
    body: "Whyte gets dangerous at rush hour. Protected lanes would help everyone share the road without squeezing transit.",
    specificComments: ["Businesses worry about parking — has anyone modeled the trade-off?"],
  },
  {
    slug: "ab-rink",
    kind: "statement",
    scope: "alberta",
    title: "Save the Elbow Park outdoor rink",
    body: "The community rink needs a small grant to reopen this winter. Neighbourhood kids have nowhere else nearby.",
    specificComments: ["Happy to volunteer for a fundraiser skate."],
  },
  {
    slug: "ab-budget-poll",
    kind: "poll",
    scope: "alberta",
    title: "Provincial budget priority for 2027",
    body: "Jurisdiction-wide poll — no district stake (whole of Alberta).",
    pollOptions: ["Healthcare", "Education", "Roads and transit"],
  },
  // ── Global ──────────────────────────────────────────────────────────────────
  {
    slug: "gl-transit",
    kind: "statement",
    scope: "global",
    title: "Transit funding should be a national priority",
    body: "Inter-city rail keeps falling behind peer countries. A standing federal fund would let provinces plan past a single election cycle.",
    specificComments: ["The Toronto–Quebec corridor should be the pilot."],
  },
  {
    slug: "gl-rcv-poll",
    kind: "poll",
    scope: "global",
    title: "Should OurSay add ranked-choice polls?",
    body: "Ranked choice lets you order options instead of picking one. Worth the added complexity?",
    pollOptions: ["Yes", "No", "Unsure"],
  },
  {
    slug: "gl-oss-petition",
    kind: "petition",
    scope: "global",
    title: "Open-source the public election software stack",
    body: "Code that counts votes should be auditable by anyone. Publish the source under an OSI licence.",
    governance: { allowRevoke: true },
    specificComments: ["Security through obscurity is not security."],
  },
  {
    slug: "gl-voting-age",
    kind: "statement",
    scope: "global",
    title: "Lower the voting age to 16",
    body: "Sixteen-year-olds work, pay tax, and drive. They should have a say in policies that shape their future.",
  },
  {
    slug: "gl-privacy",
    kind: "statement",
    scope: "global",
    title: "Stronger defaults for civic identity visibility",
    body: "Platforms should default to the narrowest audience that still enables accountability, with clear per-thread overrides.",
  },
  // ── Generic (assigned to global or Alberta at runtime) ──────────────────────
  {
    slug: "gen-library-hours",
    kind: "statement",
    scope: "generic",
    title: "Extend evening library hours",
    body: "Branches close at 6pm while many people are still commuting. Pilot longer hours at the busiest locations.",
  },
  {
    slug: "gen-snow-clearing",
    kind: "statement",
    scope: "generic",
    title: "Clear sidewalks within 24 hours of snowfall",
    body: "Pedestrians and wheelchair users are stranded when walks stay icy for days. Set a measurable SLA.",
  },
  {
    slug: "gen-community-garden",
    kind: "petition",
    scope: "generic",
    title: "Convert the vacant lot into a community garden",
    body: "The lot has sat empty for three years. A garden would feed families and reduce vandalism.",
    governance: { allowRevoke: true },
  },
  {
    slug: "gen-crosswalk",
    kind: "poll",
    scope: "generic",
    title: "Add a signalized crosswalk at the school corner?",
    body: "Parents have asked for years. Is it time to fund it?",
    pollOptions: ["Yes — this year", "Yes — next budget", "No"],
  },
  {
    slug: "gen-broadband",
    kind: "statement",
    scope: "generic",
    title: "Treat broadband as essential infrastructure",
    body: "Rural and fringe neighbourhoods still lack reliable fibre. Universal service should mean universal.",
  },
];

/** Dev address that resolves (stub geocoder) to Edmonton-Strathcona for residency + my_district visibility. */
export const DEV_STRATHCONA_ADDRESS = {
  line1: "10359 Whyte Avenue NW",
  city: "Edmonton",
  province: "AB",
  postalCode: "T6E 2A1",
  country: "CA",
} as const;
