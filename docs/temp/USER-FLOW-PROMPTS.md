# USER-FLOW-PROMPTS

Agent prompt playbook for authoring the OurSay **user-flow document** — the screen-by-screen,
step-by-step journey doc that is a prerequisite for wireframes. Local only (`.agents/` is gitignored).

Companion to [`MVP-PROMPTS.md`](./MVP-PROMPTS.md) — same five-step loop and conventions.

## Five-step loop (every task)

1. **Coding agent** — plan + implement (same prompt; build continues after plan review in chat)
2. **Review agent** — rate the plan (1–10); run or amend
3. **Coding agent** — implement (approved plan)
4. **Review agent** — QA the work (1–10); commit or send back
5. **User** — commit (or customize and loop)

**Rules:** User notes outside code blocks. Prompts inside code blocks for copy-paste. Coding agent must **not commit** — propose a short commit message only.

---

## `[doc-user-flows]` — Author the OurSay user-flow document (wireframe prerequisite)

**Conversation:** Start **fresh**. Tag: `[doc-user-flows]`
**Session ID:** _paste after run_

### Coding agent

```
Author docs/11-USER-FLOWS.md — the canonical user-flow document for OurSay. This is the wireframe
prerequisite: it maps every user-facing journey as discrete steps, the screen/state at each step, the
decision branches, the success/error end states, and the API/entity behind each step. It is the bridge
between the user stories (what users want) and wireframes (what screens to draw).

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/10-USER-STORIES.md — every US-* story; the flow doc must cover each one and cite its ID
- docs/PRD.md — §1 four-level content hierarchy (Statements → Petitions → Polls → Results), §4 personas, §5 user stories, scope/launch boundaries
- docs/02-PUBLIC-EXPLAINER.md — product framing / what users do, in plain language
- docs/08-IDENTITY-AND-DEVICE-POLICY.md — registration, passkey, login, recovery, multi-device flows and session scopes (registration / login / recovery / full)
- docs/09-ACCOUNT-PRIVACY-MODEL.md — visibility cascade (anonymous / my_district / officials / public), reveal model (design-TODO, mark Planned)
- docs/REGION-MODEL.md + docs/entities/partitioning/* — jurisdiction / district / region scoping, district inference from geocoded address, my-district counts
- docs/entities/account/* — user, profile, verification (onboarding, KYC tiers as set membership: unverified / identity_verified / residency_verified / electoral_validated)
- docs/entities/auth/* — session, passkey-credential, email-otp (OTP purposes: registration / recovery / login)
- docs/entities/civic-content/* — post, comment, reaction, petition, petition-signature, poll, vote, result (every action, its rules, its lifecycle/status enum)
- docs/API-GAPS-AND-ROADMAP.md — what is Built vs Partial vs Planned; use the [mvp-*]/[code-*] tags to label step status
- api/src/http/routes/*.routes.ts and api/openapi.yaml — the real endpoints behind each step (ground every "Built" claim in an actual route)
- api/web/walktest/ — the dev /walk harness; it sequences the real auth + civic flow end-to-end and is the best executable reference for the happy path

## Goals
1. **Document the full intended product**, not just what's built. Cover every persona and every journey
   from the user stories. Tag each flow (and each step where status differs) as one of:
   - **Built** — a real `/v1` route/service backs it today (cite the route)
   - **Partial** — service layer exists but HTTP/integration missing, or interim behavior (cite the gap tag, e.g. `[mvp-c10c-profile-patch]`)
   - **Planned** — design-only / future (cite the story or roadmap tag)
2. **Cover these personas** (from PRD §4): Guest, Unverified Participant, Identity-Verified User,
   Residency-Verified User, Official / Public Figure (MLA), Auditor / Third-Party, Administrator.
   Note where a persona is launch vs fast-follow vs future.
3. **Use the Steps + States + Branches format** for every flow. Each flow block MUST have:
   - **Flow:** name · **Persona(s):** · **Status:** Built/Partial/Planned · **Stories:** US-* ids
   - **Entry point** (what the user taps / where they arrive from)
   - **Numbered steps**, each with: the user action, the `[screen: …]` or `[state: …]` it happens on, and the `-> METHOD /v1/…` (or entity) behind it
   - **branch:** lines for every meaningful decision/error (e.g. under-18, OTP expired, KYC fail, no enrolled passkey, k-anonymity suppression, already-signed nullifier)
   - **End (success):** and **End (error/abandon):** states
   - A short **Notes** line for privacy/anonymity/tier rules that shape the UI
4. **Cover, at minimum, these flow groups** (split into sub-flows as needed):
   - **Account & auth:** Register → first civic action · Enroll passkey · Login (passkey) · Cross-device gated login · Recovery (lost device, unverified vs verified branches) · Manage/revoke passkeys · Logout · View profile · Update profile/address (Partial)
   - **Verification:** Identity verification (Didit, GitHub Sponsors donation soft-ask then free session, pass identity-only vs identity+address vs fail) · KYC re-verification on recovery (Built) · Peer sponsorship (Planned — paid-verify contingency only)
   - **Civic content (create):** Create statement/post · Create petition · Create poll (note Alberta = graduation-only) — each via thread join → prepare → submit
   - **Civic content (participate):** React (agree/disagree, switch) · Comment (threaded, depth ≤3, delete) · Sign petition (webauthn-es256, optional comment, finality/revoke) · Vote in poll (one option, anonymity flag, finality/change)
   - **Browse & read (Guest-capable):** Home/browse feed · Post detail (root + comments + tallies) · Petition detail · Poll detail/results · Counts with geo scope (jurisdiction / impacted-region / my-district / all-public) + tier breakdown + k-anonymity suppression · Browse jurisdictions/districts, district map geometry
   - **Anonymity & privacy:** Per-thread pseudonym default · Platform reveal (link/unlink persona ↔ profile, reversible) · On-chain reveal (Planned, nuclear) · Visibility cascade selection (Planned)
   - **Official / MLA:** Auto-generated profile + disclaimer · Claim profile (fast-follow) · Constituent sentiment dashboard (fast-follow)
   - **Auditor / transparency:** Sync public record · Verify signed count manifests against external anchors · Detect censorship via commitments
5. **Add a legend + status summary** up top so a reader can see at a glance what's Built vs Planned,
   and a **persona × action eligibility matrix** per jurisdiction (Alberta ladder vs oursay-global open) —
   reuse the matrices already in docs/10-USER-STORIES.md §3 rather than inventing new policy. Where the
   eligibility decision is still open in the stories (marked `<DECISION>`), carry that marker forward; do
   not invent a resolution.
6. **Cross-link** each flow to its source story IDs and the entity docs, so the doc stays traceable.
7. Keep jurisdiction-specifics behind labels (Alberta: post → "Belief", district → "riding"); do not
   hardcode Alberta assumptions into flow names that are meant to be generic.

## Deliverables
- `docs/11-USER-FLOWS.md` — the complete flow doc, following the format and coverage in Goals 3–5.
- A one-line entry added to any docs index/README that lists the numbered docs (e.g. docs/entities/README.md
  or a top-level docs index) if such an index exists — match the existing numbering convention.
- No code changes, no schema changes, no new endpoints. This is a documentation task only.

## Constraints
- Documentation only — do not edit application code, OpenAPI, or schema. If a flow reveals a missing
  endpoint, note it inline as `(gap: <tag or short description>)` and, if it is a genuinely new gap, list
  it at the end under "Gaps surfaced while mapping flows" — do not implement it.
- Ground every **Built** claim in a real route in api/src/http/routes or api/openapi.yaml. If you cannot
  find the route, label it Partial or Planned — do not assume.
- Do not resolve open product decisions (the `<DECISION>` markers in the eligibility matrices, the privacy
  visibility cascade, peer-sponsorship contingency). Carry the open question forward verbatim and mark Planned.
- Do not invent screen designs or visual layout — name screens/states functionally (`[screen: OTP + profile form]`),
  leave the actual layout to wireframes. This doc says *what screens exist and how the user moves between them*,
  not *what they look like*.
- Reuse terminology from docs/GLOSSARY.md exactly (persona Pₜ, nullifier, tier, jurisdiction, district,
  region, thread). Do not introduce new vocabulary.
- Keep it scannable: legend + status summary first, then flow groups as `##` sections, each flow as a `###`
  block. A reader should be able to find any single flow in seconds.

## Before you finish
- Verify every US-* story in docs/10-USER-STORIES.md is referenced by at least one flow (no orphan stories).
- Verify every Built step cites a route that actually exists in api/src/http/routes or api/openapi.yaml.
- Spot-check the auth flows against api/web/walktest/ to confirm the step sequence matches the real harness.
- Re-read the doc top to bottom once for the legend → matrix → flows ordering and consistent status tags.
- Propose a short commit message (imperative, focus on why). Do not commit.
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN before implementation.

## Your inputs
- The coding agent prompt for [doc-user-flows] (author docs/11-USER-FLOWS.md, the wireframe-prerequisite user-flow doc)
- The agent's proposed plan in this conversation

## Read for alignment
- docs/10-USER-STORIES.md, docs/PRD.md (§1, §4, §5)
- docs/08-IDENTITY-AND-DEVICE-POLICY.md, docs/09-ACCOUNT-PRIVACY-MODEL.md
- docs/REGION-MODEL.md, docs/entities/civic-content/*, docs/entities/account/*, docs/entities/auth/*
- docs/API-GAPS-AND-ROADMAP.md, api/src/http/routes/*, api/openapi.yaml

## Rate the plan 1–10 on
- Coverage: every persona and every US-* story has a flow; no orphan stories
- Correct status tagging (Built/Partial/Planned) grounded in real routes, not assumed
- Format discipline: Steps + States + Branches with entry/end states and per-step API/entity references
- Branch completeness: error/abandon paths, eligibility gates, k-anonymity suppression, nullifier dedupe
- Fidelity: open `<DECISION>` markers and Planned/privacy items carried forward, not resolved or invented
- Traceability: cross-links to story IDs and entity docs; glossary terms reused exactly
- Scope: documentation only; gaps noted inline, not implemented
- Scannability: legend + status summary + eligibility matrix up front; flows easy to locate

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are doing QA on a coding agent's completed work.

## Your inputs
- The coding agent prompt for [doc-user-flows]
- The produced docs/11-USER-FLOWS.md (and any docs index update)

## Read for alignment
- docs/10-USER-STORIES.md (every US-* must be referenced)
- api/src/http/routes/*, api/openapi.yaml (every "Built" step must cite a real route)
- api/web/walktest/ (auth/civic step sequence must match)
- docs/GLOSSARY.md (terminology), docs/API-GAPS-AND-ROADMAP.md (status tags)

## Rate the work 1–10 on
- All US-* stories covered; all listed flow groups present
- Steps + States + Branches format followed consistently, with end states and per-step references
- Built/Partial/Planned tags accurate and route-grounded
- Open decisions / Planned items carried forward, not invented
- Documentation-only (no code/schema/OpenAPI changes); gaps noted, not implemented
- Scannable structure (legend, matrix, flow sections) and consistent glossary terms

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief fix prompt for coding agent (specific fixes only)
```
