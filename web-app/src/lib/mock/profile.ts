import type { PublicProfile } from "@/lib/types";

/**
 * Profile view subject — the representative public profile, the MLA Rae Nguyen
 * (wireframe PROFILE). tier 3 = Official, matching her Alberta posts. The
 * authored `posts` are FeedItem-shaped (so the card renderer can display them)
 * and carry `prof-`-prefixed synthetic ids.
 */
export const PROFILE: PublicProfile = {
  name: "Rae Nguyen",
  handle: "raenguyen",
  role: "MLA · Edmonton-Strathcona",
  tier: 3,
  stats: [
    { n: 18, label: "Statements" },
    { n: 42, label: "Petitions signed" },
    { n: 7, label: "Polls" },
  ],
  // Posts tab — authored root records. No Results: a Result is a system outcome,
  // not a user-created post (and has no profile-type toggle).
  posts: [
    {
      id: "prof-rae-ravine",
      kind: "statement",
      jurisdiction: "Alberta",
      tier: 3,
      districts: ["edmonton-strathcona"],
      author: "Rae Nguyen",
      handle: "raenguyen",
      title: "Constituency update: ravine review",
      body: [
        "I've asked the ministry to pause the rezoning until the",
        "environmental review is complete.",
      ],
      up: 204,
      down: 46,
      comments: 38,
    },
    {
      id: "prof-rae-footbridge",
      kind: "petition",
      jurisdiction: "Alberta",
      tier: 3,
      districts: ["edmonton-strathcona"],
      author: "Rae Nguyen",
      handle: "raenguyen",
      title: "Repair the Mill Creek footbridge",
      body: [
        "The footbridge has been closed since spring. Fund the",
        "repair so the trail reconnects before winter.",
      ],
      sig: 1880,
      goal: 3000,
      comments: 24,
    },
    {
      id: "prof-rae-priority",
      kind: "poll",
      jurisdiction: "Alberta",
      tier: 3,
      districts: ["edmonton-strathcona"],
      author: "Rae Nguyen",
      handle: "raenguyen",
      title: "Which local priority should I table first?",
      body: [
        "Help me rank what to raise at the next sitting.",
        "One vote per resident.",
      ],
      options: [
        { label: "Transit", v: 240 },
        { label: "Parks", v: 190 },
        { label: "Roads", v: 120 },
      ],
      comments: 31,
    },
    {
      id: "prof-rae-townhall",
      kind: "statement",
      jurisdiction: "Alberta",
      tier: 3,
      districts: ["edmonton-strathcona"],
      author: "Rae Nguyen",
      handle: "raenguyen",
      title: "Town hall Saturday at the library",
      body: [
        "Drop in 10–12 at the Strathcona branch. Bring questions",
        "on the budget, transit, or the ravine review.",
      ],
      up: 96,
      down: 4,
      comments: 12,
    },
  ],
  // Activity tab — every public action. `kind` drives the profile-type filter;
  // `icon` optionally overrides the kind's default glyph (e.g. an edit uses the
  // pencil but still filters under its content type).
  activity: [
    { kind: "statement", icon: "#ic-edit", text: "Edited “Constituency update: ravine”", meta: "1d · Alberta" },
    { kind: "statement", text: "Posted “Constituency update: ravine”", meta: "2d · Alberta" },
    { kind: "comment", text: "Commented on “Whitemud ravine”", meta: "3d" },
    { kind: "comment", icon: "#ic-edit", text: "Edited a comment on “Whitemud ravine”", meta: "4d" },
    { kind: "petition", text: "Signed “Repave 109 Street”", meta: "5d" },
    { kind: "reaction", text: "Changed to Disagree on “Budget 2027”", meta: "6d" },
    { kind: "poll", text: "Voted in “Budget priority 2027”", meta: "6d" },
    { kind: "reaction", text: "Agreed with “Bike lanes on Whyte”", meta: "1w" },
    { kind: "comment", text: "Replied to Marcus Lee on the vote", meta: "1w" },
    { kind: "reaction", text: "Retracted reaction on “Green Line LRT”", meta: "2w" },
    { kind: "statement", text: "Posted “Town hall Saturday”", meta: "2w" },
    { kind: "reaction", text: "Disagreed with “Voting age 16”", meta: "3w" },
  ],
  // Mentions tab — others referencing @raenguyen (not type-filtered; a different axis).
  mentions: [
    { author: "Sam Driver", handle: "samd", text: "@raenguyen can you weigh in on the rezoning?", meta: "on “Whitemud ravine” · 1d" },
    { author: "Priya Anand", handle: "priya", text: "Thanks @raenguyen for the budget update", meta: "2d" },
    { author: "Marcus Lee", handle: "mlee", text: "@raenguyen what's the timeline on the vote?", meta: "4d" },
    { author: "Hana Okafor", handle: "hanao", text: "Grateful for @raenguyen's ravine review", meta: "1w" },
  ],
};
