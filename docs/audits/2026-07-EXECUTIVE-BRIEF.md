# OurSay Security Audit — Executive Brief

**Date:** 2026-07-06 · **Audience:** non-technical stakeholders · **Full detail:** [`2026-07-PLATFORM-AUDIT.md`](./2026-07-PLATFORM-AUDIT.md) (today) and [`2026-07-FUTURE-STATE-AUDIT.md`](./2026-07-FUTURE-STATE-AUDIT.md) (3–5 years).

## The bottom line

OurSay does something rare and valuable: it keeps an **honest line** between two very different promises — *"you can check the record wasn't tampered with, without trusting us"* and *"this vote came from a real resident of this riding."* The first is close to true; the second still relies on us plus an outside identity-check company, and the platform's own documents say so plainly. That honesty is a strength, not a weakness — over-claiming is how civic-tech projects lose public trust.

The engineering is further along than a prototype. The parts that matter — digital signatures on every recorded action, an independent tool anyone can run to re-check the results, and solid login security — are real and working, not slideware.

**But one core promise is not yet switched on.** The system is designed to publish its records to outside infrastructure we don't control, so anyone can verify them without trusting OurSay. Today that publishing step writes to **local files only**. Until it publishes externally, *"verify without trusting us"* is a design intention, not a live guarantee. **This is the single most important thing to fix before any public referendum.**

## What's strong (keep it)

- **Every recorded action is cryptographically signed** and re-checked by the server before it's accepted — fakes are rejected by the code, not by policy.
- **An independent verifier already exists** that can re-compute the totals from published data with no access to our servers or database.
- **Login and account security are done well:** modern passkeys as the everyday login, no way for attackers to fish for which emails have accounts, and password-reset codes that are single-use and time-limited.
- **The design is built to decentralize later** without a rewrite — today one operator runs it, but the record format already leaves room for a group of independent custodians to co-sign in future.
- **Privacy is taken seriously:** people are anonymous by default, and the record is built so one person's separate activities can't be linked together.

## What needs fixing before a public referendum (~October 2026)

1. **Turn on external publishing** so the "don't trust us, verify it yourself" promise becomes real.
2. **Protect the master signing key** with proper key-management hardware. Today one key does too much; if it leaked, fake "verified" activity could be created without detection.
3. **Encrypt personal data at rest** (addresses, the private links between people and their activity).
4. **Fix account recovery for verified users** — right now, a verified user who loses their device is locked out with no path back. That must be solved before people verify at scale.
5. **Strengthen identity checking.** We rely on a single provider to confirm real, unique people. A determined, well-funded actor could buy or farm fake-but-verified identities. Long-term this needs multiple independent providers, and ultimately an electoral authority.

## The Elections Alberta question — honest scoping

**Realistic by October 2026 (if the fixes above land):** a *parallel, auditable record* of a referendum where each participant can confirm their own submission was recorded correctly, and anyone can re-compute the published totals themselves. Useful and within reach — **not** a replacement for the official ballot, and **not** a claim about who is eligible to vote.

**Not realistic on that timeline (years away, some unsolved industry-wide):** running an actual government ballot. That needs guarantees OurSay cannot yet provide — proven eligibility, a genuinely secret ballot, and formal certification.

## One subtle but important trap: the "verify your own vote" receipt

There's an appealing idea: give each voter a personal receipt so they can confirm exactly how their vote was counted. For **public, attributed** votes (petitions, open polls) this is great and OurSay already supports it. **For a *secret* ballot it backfires:** the same receipt that proves your vote *to you* also proves it *to a vote-buyer or an intimidator* who demands to see it. A secret ballot must give voters *no* such provable receipt. Solving "verifiable **and** secret **and** coercion-proof" for online voting is a hard, partly-unsolved problem across the whole industry — not a feature we can simply build. We've documented this in detail (see [`../12-BALLOT-SECRECY-AND-VERIFIABILITY.md`](../12-BALLOT-SECRECY-AND-VERIFIABILITY.md)) so the distinction is never blurred in public.

## Recommended posture

Proceed toward an **auditable, receipt-backed referendum record** — a real and defensible offering — while completing the pre-launch fixes above and keeping every public claim inside what the code actually guarantees. Do not describe anything OurSay runs as a "secret ballot," an "election," or an "eligibility determination." The project's credibility rests on that discipline as much as on the technology.
