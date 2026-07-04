import type { PublicProfile } from "@/lib/types";
import { MY_HANDLE, MY_NAME } from "./constants";

/** Hand-crafted profile for the wireframe MLA (Rae Nguyen). */
export const RAE_NGUYEN_PROFILE: PublicProfile = {
  name: "Rae Nguyen",
  handle: "raenguyen",
  role: "MLA · Edmonton-Strathcona",
  tier: 3,
  bio: "MLA for Edmonton-Strathcona. Focused on the ravine review, transit, and keeping constituents in the loop.",
  ageLabel: "4 years",
  support: { agrees: 3120, disagrees: 486, statements: 18, comments: 57 },
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
      comments: 0,
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
      comments: 0,
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
      comments: 0,
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
      comments: 0,
    },
  ],
  activity: [
    { kind: "statement", icon: "#ic-edit", text: "Edited “Constituency update: ravine”", meta: "1d · Alberta", recordId: "stmt-rae-ravine" },
    { kind: "statement", text: "Posted “Constituency update: ravine”", meta: "2d · Alberta", recordId: "stmt-rae-ravine" },
    { kind: "comment", text: "Commented on “Whitemud ravine”", meta: "3d", recordId: "stmt-hana-ravine" },
    { kind: "comment", icon: "#ic-edit", text: "Edited a comment on “Whitemud ravine”", meta: "4d", recordId: "stmt-hana-ravine" },
    { kind: "petition", text: "Signed “Repave 109 Street”", meta: "5d", recordId: "pet-sam-109st" },
    { kind: "reaction", icon: "#ic-x", text: "Changed to Disagree on “Budget 2027”", meta: "6d", recordId: "stmt-premier-budget" },
    { kind: "poll", text: "Voted in “Budget priority 2027”", meta: "6d", recordId: "poll-ableg-budget" },
    { kind: "reaction", icon: "#ic-check", text: "Agreed with “Bike lanes on Whyte”", meta: "1w", recordId: "stmt-jordan-bikelanes" },
    { kind: "comment", text: "Replied to Marcus Lee on the vote", meta: "1w", recordId: "stmt-hana-ravine" },
    { kind: "reaction", icon: "#ic-check-alt", text: "Retracted reaction on “Green Line LRT”", meta: "2w", recordId: "pet-rosa-greenline" },
    { kind: "statement", text: "Posted “Town hall Saturday”", meta: "2w", recordId: "prof-rae-townhall" },
    { kind: "reaction", icon: "#ic-x", text: "Disagreed with “Voting age 16”", meta: "3w", recordId: "stmt-marcus-votingage" },
  ],
  mentions: [
    { author: "Sam Driver", handle: "samd", text: "@raenguyen can you weigh in on the rezoning?", meta: "on “Whitemud ravine” · 1d", recordId: "stmt-hana-ravine" },
    { author: "Priya Anand", handle: "priya", text: "Thanks @raenguyen for the budget update", meta: "2d", recordId: "stmt-premier-budget" },
    { author: "Marcus Lee", handle: "mlee", text: "@raenguyen what's the timeline on the vote?", meta: "4d", recordId: "stmt-hana-ravine" },
    { author: "Hana Okafor", handle: "hanao", text: "Grateful for @raenguyen's ravine review", meta: "1w", recordId: "stmt-rae-ravine" },
  ],
};

/**
 * Hand-crafted profile for the example signed-in account (wireframe MY_NAME).
 * The static `tier` is what the public /profile/alex_morgan route shows; the
 * /profile/self view overrides it with the live session kycTier.
 */
export const ALEX_MORGAN_PROFILE: PublicProfile = {
  name: MY_NAME,
  handle: MY_HANDLE,
  role: "Member · Edmonton-Strathcona",
  tier: 2,
  bio: "Strathcona resident posting about safer streets, libraries, and local budgets.",
  ageLabel: "8 months",
  support: { agrees: 214, disagrees: 33, statements: 2, comments: 9 },
  posts: [
    {
      id: "prof-alex-crosswalk",
      kind: "statement",
      jurisdiction: "Alberta",
      tier: 2,
      districts: ["edmonton-strathcona"],
      author: MY_NAME,
      handle: MY_HANDLE,
      title: "Add a crosswalk at 99 Street and Whyte",
      body: [
        "Pedestrians cut across four lanes here every morning. A",
        "marked crossing would make the school route safer.",
      ],
      up: 34,
      down: 6,
      comments: 0,
    },
    {
      id: "prof-alex-library",
      kind: "statement",
      jurisdiction: "Alberta",
      tier: 2,
      districts: ["edmonton-strathcona"],
      author: MY_NAME,
      handle: MY_HANDLE,
      title: "Extend weekend hours at the Strathcona library",
      body: [
        "The branch closes at 5 on Saturdays. Evening hours would",
        "give students and shift workers a place to study.",
      ],
      up: 21,
      down: 3,
      comments: 0,
    },
  ],
  activity: [
    { kind: "statement", text: "Posted “Add a crosswalk at 99 Street and Whyte”", meta: "1d · Alberta", recordId: "prof-alex-crosswalk" },
    { kind: "petition", text: "Signed “Twin the river-valley commuter path”", meta: "2d", recordId: "pet-wei-path" },
    { kind: "poll", text: "Voted in “Budget priority 2027”", meta: "3d", recordId: "poll-ableg-budget" },
    { kind: "comment", text: "Commented on “Whitemud ravine”", meta: "5d", recordId: "stmt-hana-ravine" },
    { kind: "reaction", icon: "#ic-check", text: "Agreed with “Bike lanes on Whyte”", meta: "1w", recordId: "stmt-jordan-bikelanes" },
    { kind: "statement", text: "Posted “Extend weekend hours at the Strathcona library”", meta: "1w · Alberta", recordId: "prof-alex-library" },
  ],
  mentions: [
    { author: "Hana Okafor", handle: "hanao", text: "@alex_morgan thanks for flagging the crossing", meta: "on “Whitemud ravine” · 2d", recordId: "stmt-hana-ravine" },
    { author: "Sam Driver", handle: "samd", text: "@alex_morgan will you sign the 109 Street petition?", meta: "4d", recordId: "pet-sam-109st" },
  ],
};

/** Hand-crafted profile for the Alberta Premier (also MLA for Calgary-Lougheed). */
export const PREMIER_PROFILE: PublicProfile = {
  name: "Hon. A. Premier",
  handle: "premier",
  role: "Premier · Alberta",
  tier: 3,
  bio: "Premier of Alberta and MLA for Calgary-Lougheed. Sharing provincial priorities and consultation updates.",
  ageLabel: "6 years",
  support: { agrees: 5400, disagrees: 1290, statements: 24, comments: 38 },
  posts: [],
  activity: [
    { kind: "statement", text: "Posted “Budget 2027 consultation now open”", meta: "3d · Alberta", recordId: "stmt-premier-budget" },
    { kind: "comment", text: "Commented on river-valley path poll", meta: "1d", recordId: "poll-river-path" },
  ],
  mentions: [
    { author: "Priya Anand", handle: "priya", text: "Thanks @premier for opening budget consultation", meta: "2d", recordId: "stmt-premier-budget" },
  ],
};
