export interface Audience {
  id: string;
  /** Short label for the card eyebrow. */
  label: string;
  headline: string;
  body: string;
  points: string[];
  cta: {
    label: string;
    /** Which form/flow the CTA points at. */
    kind: "waitlist" | "contact";
  };
}

export const audiences: Audience[] = [
  {
    id: "constituents",
    label: "Constituents",
    headline: "Be heard between elections — not just once every four years",
    body: "Your vote is one day a cycle. Your opinions are every day. OurSay gives you a structured, verifiable way to say what you actually think — and to see what people in other communities believe, so the conversation is bigger than your feed.",
    points: [
      "Express beliefs, sign petitions, and vote on public questions — all publicly counted",
      "See how opinion breaks down by area, so you can engage in civil discourse beyond your own community",
      "Participate anonymously if you choose — and still be counted",
    ],
    cta: { label: "Join the waitlist", kind: "waitlist" },
  },
  {
    id: "representatives",
    label: "Representatives",
    headline: "A clear signal from your constituents — not a fractured feed",
    body: "Right now, constituent feedback is scattered across phone calls, town halls, and a dozen social platforms. OurSay gives you one structured, on-the-record channel to hear what verified residents in your area actually think — and to respond directly.",
    points: [
      "See verified-resident sentiment on an issue, filtered to your area",
      "Respond on the record to petitions and public votes that name your office",
      "Share threads to any platform to bring constituents into the discussions that affect them",
    ],
    cta: { label: "Get in touch", kind: "contact" },
  },
  {
    id: "commentators",
    label: "Commentators & media",
    headline: "Public opinion you can report — with receipts",
    body: "No more \"a poll of 1,200 respondents suggests.\" OurSay produces transparent, auditable opinion data that anyone can independently verify, broken down by area and verification tier. Report what people actually said, and hold representatives to it.",
    points: [
      "Auditable results you can reproduce yourself — no need to take our word for it",
      "Compare a representative's record to what verified constituents in their own area said",
      "A read-only public API for independent dashboards and analysis (post-launch)",
    ],
    cta: { label: "Request early access", kind: "contact" },
  },
  {
    id: "activists",
    label: "Activists & creators",
    headline: "A movement worth sharing",
    body: "OurSay turns scattered outrage into a durable, verifiable record. Every belief, petition, and public vote is built to be shared — so the discussions that matter spread to the people they affect.",
    points: [
      "Built-in sharing to bring your audience into real, structured discussions",
      "Permanent, auditable records that can't be quietly dismissed as unrepresentative",
      "Open source and free to spread — the tools of democracy should belong to everyone",
    ],
    cta: { label: "Join the waitlist", kind: "waitlist" },
  },
];
