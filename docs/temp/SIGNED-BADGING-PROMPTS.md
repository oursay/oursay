# SIGNED-BADGING-PROMPTS

Agent prompt playbook for **Signed badging + Signed filter refinement** in the Phase D `web-app`. Local only (`.agents/` is gitignored).

Companion to [`PHASE_D_APP_PROMPTS.md`](./PHASE_D_APP_PROMPTS.md) — same five-step loop, session log, and **three-prompt structure per task** (coding agent · review plan · review QA).

**Goal:** Surface **proof-of-presence / cryptographically signed** civic actions as a first-class trust signal distinct from KYC verification tier. Add a dark-purple **Signed** pill (Lucide `PenTool`, white text) to the left of existing verification pills, support **full pill vs icon-only circle** display modes, and add a global **Signed** filter refinement that keeps only signed records and comments.

**Product intent (from user):**
- **Signed** = the record/comment/reaction was signed at publish time (WebAuthn passkey or derived per-thread key, depending on jurisdiction). It is **per-action**, not tied to residency or district.
- **KYC pills** remain account-level verification (Identity / Residency / Official).
- **Layout rules by surface:**
  - **Post cards** (feed / jurisdiction / district lists + post detail author row): KYC pill **full**, Signed pill **icon-only**
  - **Root comments** (depth 1): KYC **icon-only**, Signed **full**
  - **Nested comments** (depth 2–3): KYC **icon-only**, Signed **icon-only**
- **Filter:** new Refine row **Signed** — global binary toggle; when on, hide unsigned posts and unsigned comments. Independent of the Verified ladder and geography filters.

**Wireframe / design sources:**
- [`wireframes/DESIGN-DECISIONS.md`](../wireframes/DESIGN-DECISIONS.md) — §2 identity pills, §4 filters, §9 participatory signing (Alberta WebAuthn vs Global immediate toggle)
- [`wireframes/mobile/oursay-mobile.svg`](../wireframes/mobile/oursay-mobile.svg) — `tierPill`, `buildCard`, comment tree builders (no Signed pill yet — this task extends the pattern)
- [`docs/entities/account/verification.md`](../docs/entities/account/verification.md) — KYC tier semantics (orthogonal to Signed)
- [`docs/entities/record/record-transaction.md`](../docs/entities/record/record-transaction.md) — per-action signatures on the ledger
- [`docs/GLOSSARY.md`](../docs/GLOSSARY.md) — WebAuthn vs derived-key signing

**Existing code touchpoints:**
- `web-app/src/components/identity/VerificationPill.tsx` — tier pill (extend or pair with Signed)
- `web-app/src/components/identity/AuthorRow.tsx` — right-justified badge slot
- `web-app/src/components/chrome/FilterDropdown.tsx` — Refine section
- `web-app/src/lib/types/{records,comments,filters}.ts` — DTOs + `FeedFilterParams`
- `web-app/src/lib/read-model/matches.ts` — list matcher
- `web-app/src/lib/state/{types,filters,AppProvider}.tsx` — client filter state
- `web-app/src/lib/mock/` — sample corpus
- `web-app/src/lib/api/CONTRACT.md` — document `signed` field gap vs OpenAPI

## Five-step loop (every task)

1. **Coding agent** — plan + implement (same prompt; build continues after plan review in chat)
2. **Review agent** — rate the plan (1–10); run or amend
3. **Coding agent** — implement (approved plan)
4. **Review agent** — QA the work (1–10); commit or send back
5. **User** — commit (or customize and loop)

**Rules:** User notes outside code blocks. Prompts inside code blocks for copy-paste. Coding agent must **not commit** — propose a short commit message only. Every coding-agent block includes the **No assumptions** line near the top.

**Review agent (all tasks):** Each task below includes **Review agent — plan** (step 2) and **Review agent — QA** (step 4) blocks.

## Session log

| Tag | Task | Session ID |
|-----|------|------------|
| `[signed-badging-filter]` | Signed pill + icon collapse + Signed filter refinement | |

---

## `[signed-badging-filter]` — Signed badging, pill collapse modes, Signed filter

**Conversation:** Start **fresh** or continue any Phase D session. Tag: `[signed-badging-filter]`
**Session ID:** _paste after run_
**Depends on:** Phase D landed (`web-app` types, components, app shell, read-model helpers)

**Why one task:** Data model, read-model filter, badge components, and filter UI are one vertical slice — splitting would leave intermediate states with badges but no filter (or vice versa).

### Coding agent

```
Add Signed badging and a global Signed filter refinement to the OurSay `web-app`.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- wireframes/DESIGN-DECISIONS.md — §2 verification pills (right-justify, tier glyphs), §4 filters
  (Refine section, geography independence), §9 participatory UX (Alberta WebAuthn vs Global)
- wireframes/mobile/oursay-mobile.svg — `tierPill`, `buildCard`, comment header layout
- docs/entities/account/verification.md — KYC tiers (orthogonal to Signed)
- docs/entities/record/record-transaction.md — per-action signatures
- web-app/src/components/identity/VerificationPill.tsx — existing tier pill
- web-app/src/components/identity/AuthorRow.tsx — badge placement (§2.4 right-justify)
- web-app/src/components/chrome/FilterDropdown.tsx — Refine rows
- web-app/src/lib/types, read-model/matches.ts, state/AppProvider.tsx, lib/mock/
- web-app/src/lib/api/CONTRACT.md — update with `signed` field notes

## Product rules (must match)

### Signed vs KYC
- **Signed** = this specific post, comment, or reaction was cryptographically signed at action time
  (WebAuthn passkey or derived per-thread key — jurisdiction-dependent). Boolean per record/comment.
  No residency or district inference. Tier 0 authors can still have `signed: true`.
- **KYC pill** = account verification tier (existing `VerificationPill` behaviour unchanged except
  display mode). Signed and KYC are independent — show both when applicable.

### Badge group layout
- When `signed: true`, render a **Signed** pill **to the left of** the verification pill.
- Signed pill: **dark purple** background, **white** icon + text, Lucide **`PenTool`**.
  Use brand-scale token (e.g. `bg-brand-800` / `--color-brand-800`) — distinct from verify-tier greens/blues.
- Badge group stays **right-justified** to the row edge (§2.4). Order: `[Signed] [KYC]`.

### Pill display modes (`full` | `icon`)
- **`full`**: tight rounded pill — icon + label ("Signed" or tier label).
- **`icon`**: circle — icon only, no label; equal width/height, accessible `aria-label`.
- When `signed: false` or tier 0 with no signed pill, render nothing for that slot.

| Surface | Signed mode | KYC mode |
|---------|-------------|----------|
| Post cards + post detail author row | `icon` | `full` |
| Root comments (depth 1) | `full` | `icon` |
| Nested comments (depth 2–3) | `icon` | `icon` |

Pass depth into comment rendering (`CommentThread` / `CommentCard` / `RecordCardHeader`) to pick modes.
Post list cards use the post-card row of the table.

### Signed filter refinement
- New Refine row in `FilterDropdown`: label **Signed**, `PenTool` icon, Eye / EyeOff trailing
  (same affordance as My Districts / Affected).
- **Global** — applies to feed, jurisdiction, and district list scopes via `matches()`.
- **Independent** of Verified ladder (`tierMin`) and geography (`myDistricts` / `affected`).
- When **on**: keep only items where `signed === true`. When **off**: no signed constraint.
- On Post view: also filter the comment tree (unsigned comments hidden; show "N hidden by filters"
  count consistent with existing tier/geography hidden pattern).
- Reactions: add `signed?: boolean` to the data model where reactions are stored if needed for
  future surfaces; no reaction-author badge UI in this task unless already present.

## Goals

1. **Types** — add `signed?: boolean` (default falsy when absent) to:
   - `FeedItem`, `RecordDetail`, `CommentNode`
   - Extend `FeedFilterParams` with `signedOnly?: boolean`
   - Extend `AppState` with `signedOnly: boolean` + wire through `feedFilterFromState`
2. **Mock data** — populate `signed` across the wireframe corpus with intentional variety:
   - Global records mostly unsigned; Alberta civic actions (petitions/polls/comments) mix signed/unsigned
   - At least one feed item and one comment thread where toggling Signed filter visibly changes results
   - Document mapping in mock README or inline comment — `signed` is per-action, not per-author
3. **Read model** — update `matches()`:
   - When `filter.signedOnly`, require `item.signed === true`
   - Add/adjust comment-filter helper used by `getRecordDetail` for signed-only pruning
   - Unit tests: signed filter on feed scope; signed filter on comment tree
4. **Components**
   - `SignedPill` — `mode: 'full' | 'icon'`, dark purple, `PenTool`, `aria-label="Signed"`
   - Extend `VerificationPill` with optional `mode: 'full' | 'icon'` (icon-only circle for tier glyphs)
   - `AuthorBadgeGroup` (or equivalent) — composes Signed + Verification with correct modes;
     used by `AuthorRow` / `RecordCardHeader`
   - Thread depth → mode mapping in `CommentThread` / `CommentCard`
   - `FeedCard` / `PostView` pass post-card modes for author rows
5. **Filter UI + state**
   - `FilterDropdown`: Signed row + `onToggleSignedOnly` prop
   - `AppProvider`: `signedOnly` state, `toggleSignedOnly`, persist in feed filter derivation
   - Wire toggle through all views that open the filter (Feed, Jurisdiction, District, Post, Profile)
6. **Gallery** — `/components` demos:
   - Signed + KYC badge group: all four mode combinations (post card + root comment + nested comment)
   - Filter dropdown with Signed row active/inactive
7. **Contract** — `CONTRACT.md`: note `signed` on public read DTOs as a backend follow-up (likely from
   ledger envelope metadata); mock fills today

## Deliverables
- Types, mock, read-model, components, filter state, view wiring, tests, gallery updates
- Brief updates to `web-app/src/components/README.md` (badge group rules, Signed filter independence)
- `CONTRACT.md` gap note for `signed`

## Constraints / Out of scope
- No real WebAuthn ceremony or ledger integration — `signed` is read-model data from mock/API DTO
- No wireframe SVG edit required (optional follow-up)
- No change to KYC tier semantics or Verified ladder behaviour
- No new filter axis beyond Signed (do not merge Signed into Verified ladder)
- Do not commit

## Before you finish
- Run: `npm run typecheck -w web-app`, `npm run test -w web-app`, `npm run build -w web-app`
- Manually verify `/components` badge demos and toggle Signed filter on `/feed` + a Post with comments
- Propose a short commit message (do not commit).
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN for [signed-badging-filter] (Signed pill, icon collapse modes,
Signed filter refinement).

## Context
Adds per-action Signed badging (dark purple PenTool pill left of KYC pill) with surface-specific
full vs icon-only display, plus a global Signed filter independent of Verified/geography.

## Read for alignment
- wireframes/DESIGN-DECISIONS.md §2, §4, §9
- web-app/src/components/identity/VerificationPill.tsx, AuthorRow.tsx
- web-app/src/components/chrome/FilterDropdown.tsx
- web-app/src/lib/read-model/matches.ts
- User rules table (post card vs root vs nested comment display modes)

## Rate the plan 1–10 on
- Signed vs KYC orthogonality understood (per-action boolean, no district linkage)
- Badge group: Signed left of KYC, right-justified; dark purple + PenTool + white text
- Display mode matrix correct for post cards, post detail, root comments, nested comments (depth 2–3)
- `signed` on FeedItem / RecordDetail / CommentNode; mock variety for filter demo
- `signedOnly` in FeedFilterParams + AppState; matches() and comment filter updated + tested
- FilterDropdown Signed row (Eye/EyeOff); independent of tierMin and geography
- Gallery covers badge mode combinations; CONTRACT.md documents backend gap
- Scope: no WebAuthn, no KYC ladder changes, no wireframe SVG requirement
- Reasonable component factoring (SignedPill, VerificationPill mode, AuthorBadgeGroup)

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are reviewing COMPLETED WORK for [signed-badging-filter] (Signed pill, icon collapse modes,
Signed filter refinement).

## Your inputs
- The original [signed-badging-filter] coding agent prompt
- The implementation (diff, gallery description, test output)

## Read for alignment
- web-app/src/components/identity/* (SignedPill, VerificationPill modes, AuthorBadgeGroup, AuthorRow)
- web-app/src/components/content/CommentThread.tsx, FeedCard.tsx
- web-app/src/components/chrome/FilterDropdown.tsx
- web-app/src/lib/types, read-model/matches.ts, state/AppProvider.tsx
- web-app/src/lib/mock/, web-app/src/app/components/page.tsx
- wireframes/DESIGN-DECISIONS.md §2, §4

## Rate the work 1–10 on
- Signed pill: dark purple, white PenTool + text, positioned left of KYC pill, right-justified group
- Display modes match the matrix (post card: KYC full / Signed icon; root comment: KYC icon / Signed
  full; nested: both icon)
- `signed` field on types; mock data exercises filter toggle
- Signed filter: global, independent of Verified/geography; lists and comment threads prune correctly
- FilterDropdown Signed row with Eye/EyeOff; state wired through app views
- Tests for matches signedOnly and comment filtering pass
- Gallery demos badge combinations; components/README.md updated
- CONTRACT.md notes `signed` backend gap
- `npm run build -w web-app` and tests pass; no scope creep into WebAuthn or KYC ladder changes

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief prompt to send back to the coding agent listing specific fixes only
```
