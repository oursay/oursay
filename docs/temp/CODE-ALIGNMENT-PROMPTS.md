# CODE-ALIGNMENT-PROMPTS

Agent prompt playbook for the **code/doc alignment** work surfaced by the documentation sanity sweep
(2026-06). Each block is one logical code task that brings the application code, DB schema, or OpenAPI
into line with a now-authoritative doc decision. Local only (`.agents/` is gitignored).

Companion to [`MVP-PROMPTS.md`](./MVP-PROMPTS.md) — same five-step loop and conventions.

## Five-step loop (every task)

1. **Coding agent** — plan + implement (same prompt; build continues after plan review in chat)
2. **Review agent** — rate the plan (1–10); run or amend
3. **Coding agent** — implement (approved plan)
4. **Review agent** — QA the work (1–10); commit or send back
5. **User** — commit (or customize and loop)

**Rules:** User notes outside code blocks. Prompts inside code blocks for copy-paste. Coding agent must
**not commit** — propose a short commit message only. Every coding-agent block includes the
**No assumptions** line near the top.

**Review agent (all tasks):** Each task below includes **Review agent — plan** (step 2) and
**Review agent — QA** (step 4) blocks in the same format as [`MVP-PROMPTS.md`](./MVP-PROMPTS.md):
rate 1–10, Run/amend or Commit yes/no, specific amendment/fix bullets only.

**Suggested order (dependencies):** `[code-jurisdiction-labels-limits]` → `[code-post-content-fields]` →
`[code-content-limits-enforcement]` · `[code-applies-to-region]` → `[code-applies-to-verified]` /
`[code-entity-audience-projection]` ·
`[code-privacy-schema]` ↔ `[code-drop-claimed-columns]` (coordinate sequencing) · independent:
`[code-over-18]`, `[code-registration-scope]`, `[code-didit-provider]`,
`[code-jurisdiction-binding-fallback]` · `[code-applies-to-verified]` → `[code-jurisdiction-graduation]`.

## Session log

| Tag | Task | Session ID |
|-----|------|------------|
| `[code-post-content-fields]` | PostContent title/body required + caps | |
| `[code-content-limits-enforcement]` | comment/petition/poll contentLimits enforcement | |
| `[code-jurisdiction-labels-limits]` | JurisdictionConfig labels + contentLimits | |
| `[code-applies-to-region]` | EntityRules appliesToRegion (replace district-id array) | |
| `[code-applies-to-verified]` | EntityRules appliesToVerified (tier set) | |
| `[code-drop-claimed-columns]` | Retire thread_keys claimed/claimed_at for reveal model | |
| `[code-over-18]` | over_18 flag replaces stored birthdate | |
| `[code-registration-scope]` | registration session scope before full | |
| `[code-didit-provider]` | Didit KYC provider + provider tags | |
| `[code-privacy-schema]` | Account privacy enum + cascade schema | |
| `[code-entity-audience-projection]` | Materialized entity_audience projection | |
| `[code-jurisdiction-graduation]` | JurisdictionRules graduation (policy / create-tier / petition→poll) | |
| `[code-jurisdiction-binding-fallback]` | Root entity bound to one jurisdiction; oursay-global fallback | |
| `[code-participation-act-eligibility]` | Participation actTier gate (who may vote/sign/comment/react), distinct from appliesToVerified | |

---

## `[code-post-content-fields]` — PostContent: title required, body optional, content caps

**Conversation:** Start **fresh**. Tag: `[code-post-content-fields]`
**Session ID:** _paste after run_

### Coding agent

```
Align the `post` content shape with the documented target: `title` required (≤200), `body` optional (≤2000).

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/entities/civic-content/post.md — Attributes + Gaps
- docs/entities/partitioning/jurisdiction.md — contentLimits (caps come from JurisdictionConfig)
- public-record/src/schema/types.ts — `PostContent` (currently `{ title?: string; body: string }`)
- api/src/http/schemas.ts — civic content request schemas
- api/openapi.yaml — post create/update shapes

## Goals
1. Flip `PostContent` to `{ title: string; body?: string }`; `title` required, `body` optional.
2. Enforce max lengths from the jurisdiction's `contentLimits` (post title 200, body 2000) — depends on
   `[code-jurisdiction-labels-limits]`; if that has not landed, gate against documented Alberta caps as a
   constant and leave a TODO referencing the config field.
3. Validate at the service/HTTP boundary; reject over-length with a clear error.

## Deliverables
- Updated `PostContent` type + any zod/validation schemas; regenerate `api/openapi.yaml`.
- Tests: title-required, body-optional, over-length rejection for both fields.
- A short note in docs/entities/civic-content/post.md Gaps marking this resolved (do not remove the
  history).

## Constraints / Out of scope
- Do not change other record types' content shapes here.
- Existing rows: provide a migration or backfill plan for any NOT NULL flips (discuss before destructive
  changes).

## Before you finish
- Run: npm test -w @oursay/public-record, npm test -w @oursay/api (DB up as needed); typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN for [code-post-content-fields] (PostContent title required, body optional, content caps).

## Context
Docs now require `title` required (≤200), `body` optional (≤2000). Caps come from jurisdiction `contentLimits` (`[code-jurisdiction-labels-limits]`); if that task has not landed, the plan must gate against documented Alberta caps as a constant with a TODO.

## Read for alignment
- docs/entities/civic-content/post.md — Attributes + Gaps
- docs/entities/partitioning/jurisdiction.md — contentLimits
- public-record/src/schema/types.ts — PostContent today
- api/src/http/schemas.ts, api/openapi.yaml

## Rate the plan 1–10 on
- Correct shape flip: `{ title: string; body?: string }` (not the inverse)
- Max-length enforcement from `contentLimits` or honest interim constant + TODO referencing the config field
- Validation at service/HTTP boundary with clear over-length errors
- Migration/backfill plan for existing rows before any NOT NULL or required-field flips (discussed, not assumed)
- Test strategy: title-required, body-optional, over-length for both fields
- Doc Gaps note marking resolved without erasing history
- Scope: post content only; no other record types touched
- Estimated commit size reasonable for one PR

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are reviewing COMPLETED WORK for [code-post-content-fields] (PostContent title required, body optional, content caps).

## Your inputs
- The original [code-post-content-fields] coding agent prompt
- The implementation (diff, files changed, test output if provided)

## Read for alignment
- docs/entities/civic-content/post.md — Gaps section
- public-record/src/schema/types.ts — PostContent
- api/src/http/schemas.ts, api/openapi.yaml

## Rate the work 1–10 on
- `PostContent` and HTTP/OpenAPI shapes match `{ title: string; body?: string }`
- Title required and body optional enforced at the boundary (integration tests, not mocks-only)
- Max lengths enforced (from `contentLimits` or documented interim constant + TODO as specified)
- Over-length requests rejected with clear errors
- Existing-row migration/backfill handled or explicitly deferred with user approval — no silent data loss
- post.md Gaps updated to mark resolved; history preserved
- Tests pass: `npm test -w @oursay/public-record`, `npm test -w @oursay/api`
- No scope creep (other record types' content shapes unchanged)

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief prompt to send back to the coding agent listing specific fixes only
```

---

## `[code-content-limits-enforcement]` — Enforce remaining `contentLimits` (comment, petition, poll)

**Conversation:** Start **fresh**. Tag: `[code-content-limits-enforcement]`
**Session ID:** _paste after run_
**Depends on:** `[code-jurisdiction-labels-limits]` (config + catalog), `[code-post-content-fields]` (`validateContent` seam + post rules)

### Coding agent

```
Extend `validateContent` to enforce every cap defined in `JurisdictionContentLimits` that is not yet
wired — `comment`, `petition`, and `poll`. Post enforcement landed in `[code-post-content-fields]`;
this task completes the documented Alberta/launch caps table in jurisdiction.md.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/entities/partitioning/jurisdiction.md — contentLimits table (comment, petition, poll)
- docs/entities/civic-content/comment.md, petition.md, poll.md — Attributes
- public-record/src/schema/content.ts — `validateContent` (post branch today)
- public-record/src/schema/types.ts — `CommentContent`, `PetitionContent`, `PollContent`
- public-record/src/jurisdiction.ts — `JurisdictionContentLimits`, `DEFAULT_CONTENT_LIMITS`
- public-record/src/record.ts — `validateCreate` / `validateUpdate` wiring (already calls validateContent)

## Goals
1. **comment** — `body` required string, ≤ `contentLimits.comment.body` (default 2000).
2. **petition** — `title` required ≤200, `text` required ≤5000 (from `contentLimits.petition`).
3. **poll** — `question` required ≤200; `options` required non-empty array, length ≤ `maxOptions`
   (default 10), each option string ≤100; optional `description` ≤2000 when present (cap is in config
   for the future product field — do not add `description` to `PollContent` unless the user approves).
4. Reuse the existing engine boundary: extend `validateContent` only; caps from
   `getJurisdiction().contentLimits ?? DEFAULT_CONTENT_LIMITS` (same TODO for threading
   `jurisdictionId` as post).
5. Clear `Error` messages (e.g. `petition.text exceeds the 5000-character limit`) → HTTP 400 via
   existing `CivicRecordService` mapping.

## Deliverables
- Extended `validateContent` branches for `comment`, `petition`, `poll`.
- Tests in `public-record/test/18-content-validation.spec.ts` (or a sibling spec): per-type required
  fields, over-length rejection, poll `maxOptions` and per-option cap; confirm `post` rules unchanged.
- At least one API integration case (e.g. `api/test/12-civic-record.spec.ts`): prepare returns 400 for
  an over-limit petition or poll create.
- Gaps notes in comment.md, petition.md, poll.md marking content-limit enforcement resolved (keep
  history; other gaps on those pages stay open).

## Constraints / Out of scope
- **post** — already enforced; do not regress.
- **reaction** (`kind`), **vote** (`option`), **petition_signature** — no entries in
  `JurisdictionContentLimits`; reaction `kind` stays in `validateCreate` only.
- No HTTP/OpenAPI content-shape changes (content stays opaque on civic routes).
- JSONB storage: no DDL migration; legacy rows remain readable; new creates/updates must satisfy caps.
- Do not change `EntityRules` / `rules` embedding on petition/poll content.

## Before you finish
- Run: npm test -w @oursay/public-record, npm test -w @oursay/api; typecheck.
- `npm run openapi:dump -w @oursay/api` — expect no diff (opaque content).
- Propose a short commit message (do not commit).
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN for [code-content-limits-enforcement] (comment/petition/poll contentLimits enforcement).

## Context
`[code-jurisdiction-labels-limits]` defines + exposes caps; `[code-post-content-fields]` enforces post only via `validateContent`. This task wires the remaining `JurisdictionContentLimits` keys: comment, petition, poll. Poll `description` cap may exist before the `PollContent` field — same deferral as post task unless user approves adding the field.

## Read for alignment
- docs/entities/partitioning/jurisdiction.md — contentLimits table
- docs/entities/civic-content/comment.md, petition.md, poll.md
- public-record/src/schema/content.ts, types.ts, jurisdiction.ts

## Rate the plan 1–10 on
- comment/petition/poll caps match jurisdiction.md defaults (body 2000; title 200 + text 5000; question 200, option 100, maxOptions 10, description 2000 when present)
- Enforcement in `validateContent` at create + update (existing record.ts wiring)
- Caps resolved from `contentLimits` / `DEFAULT_CONTENT_LIMITS`, not hardcoded one-offs
- Clear over-length / over-count errors; poll validates option count and per-option length
- Test strategy covers all three types + does not break post tests
- Doc Gaps updated on the three entity pages without erasing history
- Scope: no vote/reaction/petition_signature; no post regression; no PollContent.description field unless explicitly in plan with user approval
- Estimated commit size reasonable for one PR

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are reviewing COMPLETED WORK for [code-content-limits-enforcement] (comment/petition/poll contentLimits enforcement).

## Your inputs
- The original [code-content-limits-enforcement] coding agent prompt
- The implementation (diff, files changed, test output if provided)

## Read for alignment
- docs/entities/partitioning/jurisdiction.md — contentLimits
- docs/entities/civic-content/comment.md, petition.md, poll.md — Gaps
- public-record/src/schema/content.ts
- api/test/12-civic-record.spec.ts (or equivalent 400 case)

## Rate the work 1–10 on
- comment, petition, poll caps enforced at create/update via `validateContent`
- Caps from `contentLimits` / `DEFAULT_CONTENT_LIMITS` (not ad-hoc constants)
- Over-limit / over-count requests rejected with clear errors (integration tests, not mocks-only)
- post enforcement unchanged
- vote, reaction, petition_signature untouched
- Entity doc Gaps note enforcement resolved; history preserved
- Tests pass: `npm test -w @oursay/public-record`, `npm test -w @oursay/api`
- No scope creep (no new PollContent fields unless explicitly approved)

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief prompt to send back to the coding agent listing specific fixes only
```

---

## `[code-jurisdiction-labels-limits]` — JurisdictionConfig: labels + contentLimits

**Conversation:** Start **fresh**. Tag: `[code-jurisdiction-labels-limits]`
**Session ID:** _paste after run_

### Coding agent

```
Add `labels` (per-record-type user-facing labels) and `contentLimits` (hard caps per type) to JurisdictionConfig.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/entities/partitioning/jurisdiction.md — labels + contentLimits target shape
- docs/GLOSSARY.md — vocabulary split (record types vs labels)
- public-record/src/jurisdiction.ts — `JurisdictionConfig` (has id, level, label, rules, privacy, counts)
- jurisdiction-data/ab-ca-gov/jurisdiction.ts, jurisdiction-data/oursay-global/jurisdiction.ts

## Goals
1. Extend `JurisdictionConfig` with optional `labels` (post/petition/poll/result/district) and
   `contentLimits` (per-type caps). Keep existing singular `label` (the jurisdiction's own display name)
   distinct from the new `labels` map.
2. Populate `ab-ca-gov` (Statement, Petition, Poll, Result; district `riding`; caps per doc) and
   `oursay-global` (all defaults).
3. Surface `labels`/`contentLimits` wherever the public area/jurisdiction catalog is served, so clients
   can render labels without hardcoding.

## Deliverables
- Updated type + the two jurisdiction-data configs; regenerate `api/openapi.yaml` if catalog shape changes.
- Tests asserting AB + global label/limit values resolve via `getJurisdiction()`.

## Constraints / Out of scope
- Labels are display only — never a partition key or used as a dev term.
- Enforcement of `contentLimits` is `[code-post-content-fields]` (post) then
  `[code-content-limits-enforcement]` (comment, petition, poll); this task only defines + exposes the config.

## Before you finish
- Run: npm test -w @oursay/public-record, npm test -w @oursay/api; typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN for [code-jurisdiction-labels-limits] (JurisdictionConfig labels + contentLimits).

## Context
This task defines and exposes config only. Enforcement of caps is `[code-post-content-fields]` (post) and `[code-content-limits-enforcement]` (comment, petition, poll) — the plan must not sneak in validation here.

## Read for alignment
- docs/entities/partitioning/jurisdiction.md — labels + contentLimits target shape
- docs/GLOSSARY.md — record types vs display labels
- public-record/src/jurisdiction.ts — JurisdictionConfig today
- jurisdiction-data/ab-ca-gov/jurisdiction.ts, jurisdiction-data/oursay-global/jurisdiction.ts

## Rate the plan 1–10 on
- `labels` map (post/petition/poll/result/district) and `contentLimits` added without conflating singular `label` (jurisdiction display name)
- `ab-ca-gov` populated per doc (Statement, Petition, Poll, Result; district `riding`; caps)
- `oursay-global` uses sensible defaults
- Labels/contentLimits exposed on the public jurisdiction/area catalog surface clients consume
- Labels are display-only — never partition keys or dev terms
- Test strategy: AB + global values resolve via `getJurisdiction()`
- OpenAPI regeneration if catalog shape changes
- Scope: config definition + exposure only; no content validation enforcement
- Estimated commit size reasonable for one PR

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are reviewing COMPLETED WORK for [code-jurisdiction-labels-limits] (JurisdictionConfig labels + contentLimits).

## Your inputs
- The original [code-jurisdiction-labels-limits] coding agent prompt
- The implementation (diff, files changed, test output if provided)

## Read for alignment
- docs/entities/partitioning/jurisdiction.md
- public-record/src/jurisdiction.ts
- jurisdiction-data/ab-ca-gov/jurisdiction.ts, jurisdiction-data/oursay-global/jurisdiction.ts
- api/openapi.yaml — catalog shape if changed

## Rate the work 1–10 on
- `JurisdictionConfig` extended with `labels` and `contentLimits`; singular `label` unchanged in meaning
- AB config values match the doc (record labels, district label, caps)
- Global config has documented defaults
- Catalog/public area API serves labels and contentLimits (clients need not hardcode)
- Tests assert AB + global resolve correctly via `getJurisdiction()`
- Labels never used as partition keys or internal identifiers
- No content-length enforcement added here (that belongs in `[code-post-content-fields]`)
- Tests pass: `npm test -w @oursay/public-record`, `npm test -w @oursay/api`

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief prompt to send back to the coding agent listing specific fixes only
```

---

## `[code-applies-to-region]` — EntityRules: appliesToRegion replaces appliesToDistrictIds

**Conversation:** Start **fresh**. Tag: `[code-applies-to-region]`
**Session ID:** _paste after run_

### Coding agent

```
Introduce `EntityRules.appliesToRegion` (a region reference / union) as the thread's geographic stake, replacing the raw `appliesToDistrictIds` array on the doc/public surface.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/entities/partitioning/entity-rules.md — appliesToRegion forms + Gaps
- docs/entities/partitioning/region.md, docs/REGION-MODEL.md — Region kinds, district_slug, compileScope
- docs/entities/partitioning/district.md — district_slug stable key vs revision id
- public-record/src/schema/types.ts — `EntityRules.appliesToDistrictIds`
- public-record/src/governance.ts — resolveRules / impacted-region compile
- geo/src/region-resolver.ts — RegionResolver, compileScope, fromDistrictUnion

## Goals
1. Define a `RegionRef` form: `jurisdiction` | `district:<district_slug>` | `district:<revisionId>` |
   `region:<presetId>` | union (And/Or/Not, not Xor). Add `appliesToRegion` to `EntityRules`.
2. Compile `appliesToRegion` to a `Region` via the resolver (stable `district_slug` → current revision at
   asOf). Keep `appliesToDistrictIds` accepted as a deprecated alias during migration; map it to the new
   form internally.
3. Update the `impacted-region` GeoScope path to read `appliesToRegion`.

## Deliverables
- Type + governance + resolver changes; regenerate `api/openapi.yaml`.
- Tests: district-slug ref resolves across boundary revisions; union composition; legacy
  `appliesToDistrictIds` still resolves identically.

## Constraints / Out of scope
- `appliesToVerified` is a separate task (`[code-applies-to-verified]`).
- Never expose a raw district-id query surface on public routes (REGION-MODEL invariant).
- A thread may narrow but never widen its audience.

## Before you finish
- Run: npm test -w @oursay/public-record, -w @oursay/geo, -w @oursay/api; typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN for [code-applies-to-region] (EntityRules appliesToRegion replaces appliesToDistrictIds).

## Context
`appliesToVerified` is a separate task (`[code-applies-to-verified]`). `entity_audience` projection depends on this task (`[code-entity-audience-projection]`). REGION-MODEL invariant: never expose raw district-id query on public routes; a thread may narrow but never widen audience.

## Read for alignment
- docs/entities/partitioning/entity-rules.md — appliesToRegion forms + Gaps
- docs/entities/partitioning/region.md, docs/REGION-MODEL.md
- docs/entities/partitioning/district.md — district_slug vs revision id
- public-record/src/governance.ts, geo/src/region-resolver.ts

## Rate the plan 1–10 on
- `RegionRef` forms: jurisdiction | riding:<slug> | district:<revisionId> | region:<presetId> | And/Or/Not union (not Xor)
- `appliesToRegion` compiles to `Region` via resolver; `district_slug` resolves to current revision at `asOf`
- Legacy `appliesToDistrictIds` accepted as deprecated alias mapping to new form internally
- `impacted-region` GeoScope path reads `appliesToRegion`
- No raw district-id public query surface introduced
- Narrow-only audience rule preserved
- Test strategy: district-slug across boundary revisions; union composition; legacy alias identical resolution
- Scope: no `appliesToVerified`; no entity_audience projection yet
- Estimated commit size reasonable for one PR

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are reviewing COMPLETED WORK for [code-applies-to-region] (EntityRules appliesToRegion replaces appliesToDistrictIds).

## Your inputs
- The original [code-applies-to-region] coding agent prompt
- The implementation (diff, files changed, test output if provided)

## Read for alignment
- docs/entities/partitioning/entity-rules.md, docs/REGION-MODEL.md
- public-record/src/schema/types.ts, public-record/src/governance.ts
- geo/src/region-resolver.ts
- api/openapi.yaml

## Rate the work 1–10 on
- `appliesToRegion` / `RegionRef` implemented per doc forms
- Resolver compiles refs to `Region`; district_slug stable across boundary revisions (tests prove it)
- Union composition (And/Or/Not) works as specified
- Legacy `appliesToDistrictIds` still resolves identically during migration
- `impacted-region` scope uses `appliesToRegion`
- No public raw district-id query params or surfaces added
- Audience narrow-only invariant not violated
- Tests pass: `npm test -w @oursay/public-record`, `npm test -w @oursay/geo`, `npm test -w @oursay/api`
- No scope creep (`appliesToVerified`, entity_audience projection, custom region CRUD)

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief prompt to send back to the coding agent listing specific fixes only
```

---

## `[code-applies-to-verified]` — EntityRules: appliesToVerified (min tier set)

**Conversation:** Start **fresh**. Tag: `[code-applies-to-verified]`
**Session ID:** _paste after run_

### Coding agent

```
Add `EntityRules.appliesToVerified` — the minimum KYC tier set counting toward a thread's stake/official totals.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/entities/partitioning/entity-rules.md — appliesToVerified
- docs/entities/account/verification.md — tiers are set membership, not a ladder
- public-record/src/schema/types.ts — `EntityRules`
- api/src/types/kyc.ts, api/src/services/kyc.service.ts — tier set membership
- api/src/services/public-record-read.service.ts — tier resolution on counts

## Goals
1. Add `appliesToVerified` (a tier set) to `EntityRules`; absent ⇒ the jurisdiction's default tier floor.
2. Apply it as an AND with the existing geo + request-tier filtering on `/counts`; respect set membership
   (no rank table) and the k-anonymity floor.
3. Keep `vote`/`petition_signature` webauthn-es256 hard override unchanged.

## Deliverables
- Type + count-resolution changes; regenerate `api/openapi.yaml`.
- Tests: stake counts include only tiers in the set; default floor when absent; k-anonymity still engages.

## Constraints / Out of scope
- Geographic stake is `[code-applies-to-region]`.
- No PII on the public surface; tiers are slugs only.

## Before you finish
- Run: npm test -w @oursay/public-record, -w @oursay/api; typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN for [code-applies-to-verified] (EntityRules appliesToVerified min tier set).

## Context
Geographic stake is `[code-applies-to-region]`. Tiers are set membership, not a rank ladder (docs/entities/account/verification.md). `vote` / `petition_signature` webauthn-es256 hard override must remain unchanged.

## Read for alignment
- docs/entities/partitioning/entity-rules.md — appliesToVerified
- docs/entities/account/verification.md — tier set semantics
- api/src/services/public-record-read.service.ts — count/tier resolution today
- api/src/types/kyc.ts, api/src/services/kyc.service.ts

## Rate the plan 1–10 on
- `appliesToVerified` added as a tier set; absent ⇒ jurisdiction default tier floor
- Applied as AND with existing geo + request-tier filtering on `/counts`
- Set membership semantics (no at-or-above ladder)
- k-anonymity floor still engages when narrowing
- webauthn-es256 hard override for vote/petition_signature untouched
- No PII on public surface; tier slugs only
- Test strategy: counts include only tiers in set; default floor when absent; k-anon still works
- Scope: no geographic stake changes; no new public user-tier lookup API
- Estimated commit size reasonable for one PR

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are reviewing COMPLETED WORK for [code-applies-to-verified] (EntityRules appliesToVerified min tier set).

## Your inputs
- The original [code-applies-to-verified] coding agent prompt
- The implementation (diff, files changed, test output if provided)

## Read for alignment
- docs/entities/partitioning/entity-rules.md
- docs/entities/account/verification.md
- api/src/services/public-record-read.service.ts
- api/openapi.yaml — counts + entity rules shapes

## Rate the work 1–10 on
- `appliesToVerified` on `EntityRules` filters stake/official counts by tier set membership
- Default jurisdiction tier floor applies when field absent
- Geo + request-tier AND semantics preserved
- Set membership only — not cumulative/at-or-above tier ladder
- k-anonymity floor still enforced when filters narrow
- vote/petition_signature webauthn-es256 hard override unchanged
- No PII or per-participant tier on public HTTP responses
- Integration tests pass (not mocks-only for count filtering)
- Tests pass: `npm test -w @oursay/public-record`, `npm test -w @oursay/api`
- No scope creep (geo stake, Didit provider, privacy schema)

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief prompt to send back to the coding agent listing specific fixes only
```

---

## `[code-drop-claimed-columns]` — Retire thread_keys claimed/claimed_at for the reveal model

**Conversation:** Start **fresh**. Tag: `[code-drop-claimed-columns]`
**Session ID:** _paste after run_

### Coding agent

```
Replace the persona `claimed`/`claimed_at` mechanism with the reveal model; deprecate the columns.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/entities/civic-identity/thread-persona.md — deprecated columns + Gaps
- docs/entities/civic-identity/future.md — reveal model (platform-reversible vs on-chain-nuclear)
- docs/09-ACCOUNT-PRIVACY-MODEL.md — relationship to reveal
- public-record/src/schema/postgres.sql.ts — `thread_keys.claimed` / `claimed_at` (lines ~110)

## Goals
1. Confirm nothing reads/writes `claimed`/`claimed_at` in app code; if anything does, remove the
   dependency.
2. Mark the columns deprecated (comment + leave in place until the privacy/reveal migration), OR drop them
   behind a migration if the reveal schema (`[code-privacy-schema]`) lands first — confirm sequencing with
   the user.
3. Do not build the reveal flow here — this task only retires the old columns/usage.

## Deliverables
- Code/schema changes (comment-deprecate or migration); tests confirming no behavioural reliance on the
  columns.

## Constraints / Out of scope
- The reveal flow itself and the privacy cascade are `[code-privacy-schema]`.
- No destructive migration without an explicit go-ahead.

## Before you finish
- Run: npm test -w @oursay/public-record, -w @oursay/api; typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN for [code-drop-claimed-columns] (retire thread_keys claimed/claimed_at).

## Context
Reveal flow and privacy cascade are `[code-privacy-schema]`. This task only retires old columns/usage — does not build reveal. Sequencing with privacy-schema must be explicit: comment-deprecate vs drop behind migration.

## Read for alignment
- docs/entities/civic-identity/thread-persona.md — deprecated columns + Gaps
- docs/entities/civic-identity/future.md — reveal model
- public-record/src/schema/postgres.sql.ts — thread_keys.claimed / claimed_at

## Rate the plan 1–10 on
- Audit confirms no app code reads/writes `claimed`/`claimed_at` (or plan removes any found usage)
- Deprecate-vs-drop decision aligned with `[code-privacy-schema]` sequencing; user consulted before destructive migration
- No reveal flow implementation sneaked in
- Test strategy confirms no behavioural reliance on columns
- Honest about leaving columns in place until privacy migration if that is the chosen path
- Scope: column retirement only; no privacy enum/cascade work
- Estimated commit size reasonable for one PR

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are reviewing COMPLETED WORK for [code-drop-claimed-columns] (retire thread_keys claimed/claimed_at).

## Your inputs
- The original [code-drop-claimed-columns] coding agent prompt
- The implementation (diff, files changed, test output if provided)

## Read for alignment
- docs/entities/civic-identity/thread-persona.md
- public-record/src/schema/postgres.sql.ts — thread_keys

## Rate the work 1–10 on
- No application code depends on `claimed`/`claimed_at` behaviour
- Columns deprecated (comment) or dropped per agreed sequencing with `[code-privacy-schema]` — no unauthorized destructive migration
- Reveal flow not implemented here (correct deferral)
- Tests confirm no behavioural reliance on deprecated columns
- thread-persona.md Gaps/history updated if applicable
- Tests pass: `npm test -w @oursay/public-record`, `npm test -w @oursay/api`
- No scope creep (privacy schema, reveal UX, cascade resolver)

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief prompt to send back to the coding agent listing specific fixes only
```

---

## `[code-over-18]` — over_18 flag replaces stored birthdate

**Conversation:** Start **fresh**. Tag: `[code-over-18]`
**Session ID:** _paste after run_

### Coding agent

```
Store the age gate as a boolean `over_18`, dropping the stored `birthdate`, provided KYC/recovery can re-prompt.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/entities/account/profile.md — over_18 target + Gaps
- docs/entities/account/future.md — over_18 rationale
- api/src/schema/auth.sql.ts — `auth.profiles.birthdate` (DATE NOT NULL)
- api/src/helpers/age.ts — ageInYears / ageAtLeast / parseBirthdate
- api/src/services/registration.service.ts — age check at registration
- api/src/repo/profile.repo.ts, api/src/http/schemas.ts

## Goals
1. Compute 18+ at registration from the supplied DOB, persist only `over_18` (boolean); stop storing the
   date once confirmed the KYC/recovery flow can re-prompt for age if ever needed (confirm with user).
2. Migration: add `over_18`, backfill from existing `birthdate`, then deprecate/drop `birthdate`.
3. Keep `age.ts` for the registration-time computation; it just no longer persists the date.

## Deliverables
- Schema migration + repo/service/schema updates; regenerate `api/openapi.yaml`.
- Tests: under-18 rejected; `over_18` persisted; no DOB stored.

## Constraints / Out of scope
- No destructive drop of `birthdate` without explicit go-ahead + backfill verified.

## Before you finish
- Run: npm test -w @oursay/api; typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN for [code-over-18] (over_18 flag replaces stored birthdate).

## Context
Docs require storing only `over_18` boolean after registration-time age check. KYC/recovery must be able to re-prompt for age if needed — the plan must confirm this with the user before dropping `birthdate`.

## Read for alignment
- docs/entities/account/profile.md — over_18 target + Gaps
- docs/entities/account/future.md — rationale
- api/src/schema/auth.sql.ts — profiles.birthdate today
- api/src/helpers/age.ts, api/src/services/registration.service.ts

## Rate the plan 1–10 on
- 18+ computed at registration from supplied DOB; only `over_18` persisted thereafter
- Migration: add `over_18`, backfill from existing `birthdate`, then deprecate/drop `birthdate` — with explicit user go-ahead before destructive drop
- `age.ts` retained for registration-time computation only
- Under-18 rejection at registration preserved
- OpenAPI/profile schemas updated; no DOB on wire after migration
- Test strategy: under-18 rejected; `over_18` persisted; no stored DOB
- Privacy: birthdate not retained once policy is confirmed
- Estimated commit size reasonable for one PR

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are reviewing COMPLETED WORK for [code-over-18] (over_18 flag replaces stored birthdate).

## Your inputs
- The original [code-over-18] coding agent prompt
- The implementation (diff, files changed, test output if provided)

## Read for alignment
- docs/entities/account/profile.md — Gaps
- api/src/schema/auth.sql.ts, api/src/repo/profile.repo.ts
- api/src/http/schemas.ts, api/openapi.yaml

## Rate the work 1–10 on
- Registration rejects users under 18
- `over_18` boolean persisted; birthdate not stored on new registrations
- Migration backfills `over_18` from existing `birthdate` rows
- `birthdate` column deprecated or dropped only with explicit approval and verified backfill
- Profile/OpenAPI shapes expose `over_18` not DOB
- `age.ts` used at registration only — not persisting date
- profile.md Gaps updated appropriately
- Tests pass: `npm test -w @oursay/api`
- No scope creep (KYC provider, privacy cascade, registration scope)

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief prompt to send back to the coding agent listing specific fixes only
```

---

## `[code-registration-scope]` — registration session scope before full

**Conversation:** Start **fresh**. Tag: `[code-registration-scope]`
**Session ID:** _paste after run_

### Coding agent

```
Issue a limited `registration` session scope from OTP registration (enroll first passkey only); grant `full` only after passkey login.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/entities/auth/session.md — SessionScope incl. registration target + Gaps
- docs/entities/auth/future.md — registration scope
- docs/GLOSSARY.md — Session scope
- api/src/services/registration.service.ts — issues `authService.issue(userId, "full", …)` (~line 154)
- api/src/services/auth.service.ts — `issue`, scope handling
- api/src/schema/auth.sql.ts — `SessionScope`; api/src/http/* scope guards

## Goals
1. Add `registration` to `SessionScope`; registration issues `registration` (enroll first passkey only),
   not `full`.
2. After the user logs in with the newly enrolled passkey, issue `full`. Ensure civic write/profile
   routes require `full`.
3. Mirror the existing limited-scope semantics (like `recovery`/`login`): registration scope may only
   enroll a passkey.

## Deliverables
- Scope enum + registration/auth service + route-guard updates; regenerate `api/openapi.yaml`.
- Tests: fresh registration cannot take civic action; can enroll passkey; passkey login yields `full`.

## Constraints / Out of scope
- Don't change recovery/login behaviour.

## Before you finish
- Run: npm test -w @oursay/api (registration, login, golden-path specs); typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN for [code-registration-scope] (registration session scope before full).

## Context
Today registration issues `full` scope (~line 154 in registration.service.ts). Target: `registration` scope allows passkey enroll only; `full` after passkey login. recovery/login behaviour must not change.

## Read for alignment
- docs/entities/auth/session.md — SessionScope + Gaps
- docs/entities/auth/future.md, docs/GLOSSARY.md
- api/src/services/registration.service.ts, api/src/services/auth.service.ts
- api/src/schema/auth.sql.ts — SessionScope; route scope guards

## Rate the plan 1–10 on
- `registration` added to `SessionScope` enum/DB
- OTP registration issues `registration`, not `full`
- `registration` scope limited to passkey enroll (mirrors recovery/login limited-scope semantics)
- Passkey login after enroll issues `full`
- Civic write and profile routes require `full`
- recovery/login behaviour unchanged
- Test strategy: fresh registration cannot civic act; can enroll passkey; login → `full`
- OpenAPI/session docs updated
- Estimated commit size reasonable for one PR

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are reviewing COMPLETED WORK for [code-registration-scope] (registration session scope before full).

## Your inputs
- The original [code-registration-scope] coding agent prompt
- The implementation (diff, files changed, test output if provided)

## Read for alignment
- docs/entities/auth/session.md
- api/src/services/registration.service.ts, api/src/services/auth.service.ts
- api/src/http/* scope guards
- api/openapi.yaml

## Rate the work 1–10 on
- `registration` scope exists and is issued on OTP registration completion
- `registration` session cannot perform civic writes or other `full`-only actions
- `registration` session can enroll first passkey only
- Passkey login after registration issues `full` scope
- Civic/profile routes enforce `full` requirement
- recovery/login scopes and behaviour unchanged
- session.md Gaps updated if applicable
- Integration tests on registration, login, golden-path specs pass
- Tests pass: `npm test -w @oursay/api`
- No scope creep (Didit KYC, privacy schema, over_18)

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief prompt to send back to the coding agent listing specific fixes only
```

---

## `[code-didit-provider]` — Didit KYC provider + provider tags

**Conversation:** Start **fresh**. Tag: `[code-didit-provider]`
**Session ID:** _paste after run_

### Coding agent

```
Add Didit as the MVP KYC provider behind the existing provider seam, with provider tags orthogonal to tiers.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/entities/account/verification.md — Didit (dev ID-only + platform self-signed address; prod POA; free to user + donation soft-ask) + Gaps
- docs/entities/account/future.md — provider tags
- api/src/config.ts — `KycProviderName = "stub" | "equifax"` (~line 127)
- api/src/services/kyc/provider.ts, kyc/index.ts, kyc/stub-provider.ts — provider seam
- api/src/services/kyc.service.ts, api/src/types/kyc.ts

## Goals
1. Add `didit` to `KycProviderName` and a `DiditKycProvider` implementing `KycProvider`.
   - Dev: ID-only verification (free) + platform self-signed address attestation.
   - Prod: Didit proof-of-address (POA) verification (platform-paid; free to user). Soft-ask GitHub Sponsors before session per contributor §5.5.
2. Keep tiers (set membership) and provider tags orthogonal; record the provider tag on the attestation.
   Reserve `canadian_verified` (Equifax) and `electoral_verified` (Elections Alberta) as future tags only.
3. Never imply an Elections Alberta partnership; residency ≠ electoral eligibility.

## Deliverables
- Provider impl + config wiring (env `KYC_PROVIDER`); tests with a mocked Didit transport (no live calls).
- Updated `api/.env.example`.

## Constraints / Out of scope
- No live network calls in tests.
- Equifax/electoral remain future tags — do not implement them.

## Before you finish
- Run: npm test -w @oursay/api; typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN for [code-didit-provider] (Didit KYC provider + provider tags).

## Context
Extends the existing KycProvider seam (stub today). Tiers = set membership; provider tags orthogonal. `canadian_verified` (Equifax) and `electoral_verified` (Elections Alberta) are future tags only — must not be implemented. Never imply Elections Alberta partnership.

## Read for alignment
- docs/entities/account/verification.md — Didit dev/prod behaviour + Gaps
- docs/entities/account/future.md — provider tags
- api/src/services/kyc/provider.ts, kyc/stub-provider.ts — seam to extend
- api/src/config.ts — KycProviderName

## Rate the plan 1–10 on
- `didit` added to `KycProviderName` with `DiditKycProvider` implementing `KycProvider`
- Dev: ID-only + platform self-signed address attestation (no live network in tests)
- Prod path: POA verification with explicit cost/consent per spec
- Provider tag recorded on attestation; orthogonal to tier set membership
- Config via `KYC_PROVIDER` env; `api/.env.example` updated
- Mocked Didit transport in tests — no live API calls
- Equifax/electoral tags reserved only, not implemented
- Residency ≠ electoral eligibility messaging honest
- Estimated commit size reasonable for one PR

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are reviewing COMPLETED WORK for [code-didit-provider] (Didit KYC provider + provider tags).

## Your inputs
- The original [code-didit-provider] coding agent prompt
- The implementation (diff, files changed, test output if provided)

## Read for alignment
- docs/entities/account/verification.md
- api/src/services/kyc/ — provider impl
- api/src/config.ts, api/.env.example

## Rate the work 1–10 on
- `DiditKycProvider` wired behind `KYC_PROVIDER=didit` config
- Implements `KycProvider` seam; business logic does not call vendor SDK directly from routes
- Dev behaviour: ID-only + self-signed address attestation as documented
- Prod POA path documented with cost/consent where applicable
- Provider tag stored on attestation; tiers remain set-membership orthogonal
- Tests use mocked transport — no live Didit network calls in CI
- `canadian_verified` / `electoral_verified` not implemented (future only)
- No misleading Elections Alberta partnership copy
- verification.md Gaps updated if applicable
- Tests pass: `npm test -w @oursay/api`
- No scope creep (Equifax integration, electoral verification UX, sponsorship flow)

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief prompt to send back to the coding agent listing specific fixes only
```

---

## `[code-privacy-schema]` — Account privacy enum + cascade

**Conversation:** Start **fresh**. Tag: `[code-privacy-schema]`
**Session ID:** _paste after run_

### Coding agent

```
Implement the account visibility model: enum `anonymous | my_district | officials | public` with a narrow-only cascade and 404-on-out-of-scope.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/09-ACCOUNT-PRIVACY-MODEL.md — enum, cascade, reveal relationship (authoritative)
- docs/06-PRIVACY-REVIEW.md — disclosure matrix (record privacy unchanged)
- docs/08-IDENTITY-AND-DEVICE-POLICY.md — per-(user, jurisdiction) compartmentalization key
- api/src/schema/auth.sql.ts, api/src/repo/* — where account/profile + handle surfaces live

## Goals
1. Schema: account default `account_privacy`; `(user, jurisdiction) → visibility` override; optional
   `(user, thread)` override (narrow-only). Coordinate with `[code-drop-claimed-columns]`.
2. Resolver `effectiveVisibility = thread ?? jurisdiction ?? account ?? anonymous`; reject thread/jur
   overrides that would widen.
3. Read-path enforcement on every handle/identity surface; **404 (not 403)** when out of scope.

## Deliverables
- Migration + resolver + read-path guards; regenerate `api/openapi.yaml`; tests for cascade, narrow-only,
  404 behaviour.

## Constraints / Out of scope
- Governs the handle/identity surface only — does not loosen record-privacy invariants (06).
- The reveal flow (creating the persona→profile link) can be a follow-on; this task is the visibility
  schema + enforcement.

## Before you finish
- Run: npm test -w @oursay/api; typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN for [code-privacy-schema] (account privacy enum + narrow-only cascade).

## Context
Authoritative: docs/09-ACCOUNT-PRIVACY-MODEL.md. Governs handle/identity surface only — must not loosen record-privacy invariants (docs/06). Coordinate with `[code-drop-claimed-columns]`. Reveal flow (persona→profile link) can be follow-on; this task is schema + enforcement.

## Read for alignment
- docs/09-ACCOUNT-PRIVACY-MODEL.md — enum, cascade, 404 rule
- docs/06-PRIVACY-REVIEW.md — record privacy unchanged
- docs/08-IDENTITY-AND-DEVICE-POLICY.md — per-(user, jurisdiction) compartmentalization
- api/src/schema/auth.sql.ts, api/src/repo/*

## Rate the plan 1–10 on
- Schema: `anonymous | my_district | officials | public` with account default + jurisdiction override + optional thread override (narrow-only)
- Resolver: `effectiveVisibility = thread ?? jurisdiction ?? account ?? anonymous`
- Overrides that would widen rejected at write time
- Read-path enforcement on every handle/identity surface
- **404 (not 403)** when viewer out of scope
- Coordination plan with `[code-drop-claimed-columns]` explicit
- Test strategy: cascade precedence, narrow-only rejection, 404 behaviour
- Scope: no reveal UX; no record-privacy loosening
- Estimated commit size reasonable for one PR

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are reviewing COMPLETED WORK for [code-privacy-schema] (account privacy enum + narrow-only cascade).

## Your inputs
- The original [code-privacy-schema] coding agent prompt
- The implementation (diff, files changed, test output if provided)

## Read for alignment
- docs/09-ACCOUNT-PRIVACY-MODEL.md
- docs/06-PRIVACY-REVIEW.md — record privacy matrix unchanged
- api/src/schema/auth.sql.ts, resolver + read-path guards
- api/openapi.yaml

## Rate the work 1–10 on
- Privacy enum and override tables migrated as specified
- `effectiveVisibility` resolver: thread → jurisdiction → account → anonymous
- Narrow-only: widening overrides rejected; narrowing allowed
- Every handle/identity read path enforces visibility
- Out-of-scope requests return **404**, not 403
- Record-privacy invariants in docs/06 not loosened
- Reveal flow not required here (schema/enforcement only is acceptable)
- Integration tests cover cascade, narrow-only, and 404 cases
- Tests pass: `npm test -w @oursay/api`
- No scope creep (full reveal UX, on-chain nuclear reveal, browse feed)

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief prompt to send back to the coding agent listing specific fixes only
```

---

## `[code-entity-audience-projection]` — Materialized entity_audience projection

**Conversation:** Start **fresh**. Tag: `[code-entity-audience-projection]`
**Session ID:** _paste after run_

### Coding agent

```
Add a materialized `entity_audience` projection mapping each root entity to its resolved region(s) for fast district-page listing.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/entities/partitioning/future.md — entity_audience projection
- docs/entities/partitioning/entity-rules.md — appliesToRegion (source of audience)
- docs/entities/record/entity-projection.md — fold-on-read projection pattern
- public-record/src/schema/postgres.sql.ts — existing projection views
- geo/src/region-resolver.ts — region resolution

## Goals
1. Define `entity_audience` (entity_id → resolved district_slug(s)/region) derived from each root entity's
   `appliesToRegion` (depends on `[code-applies-to-region]`).
2. Support a district-page query: "every thread that applies to riding X" without per-request region
   compilation.
3. Decide refresh strategy (incremental on entity create/update vs materialized view refresh) and document
   it.

## Deliverables
- Projection DDL + populate/refresh path; a read query/route for district-page listing (or a service
  method); tests asserting membership for single-district, union, and jurisdiction-wide threads.

## Constraints / Out of scope
- Depends on `[code-applies-to-region]`; do not start before that lands (or stub against it explicitly).
- No raw participant points; this is entity→region, not user→region.

## Before you finish
- Run: npm test -w @oursay/public-record, -w @oursay/geo, -w @oursay/api; typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan

```
You are reviewing a coding agent's PLAN for [code-entity-audience-projection] (materialized entity_audience projection).

## Context
Depends on `[code-applies-to-region]` — plan must not assume `appliesToRegion` exists unless that task landed, or must stub explicitly. This is entity→region projection for district-page listing, not user→region participant geo.

## Read for alignment
- docs/entities/partitioning/future.md — entity_audience projection
- docs/entities/partitioning/entity-rules.md — appliesToRegion source
- docs/entities/record/entity-projection.md — fold-on-read pattern reference
- public-record/src/schema/postgres.sql.ts — existing projection views
- geo/src/region-resolver.ts

## Rate the plan 1–10 on
- `entity_audience` maps entity_id → resolved district_slug(s)/region from root entity `appliesToRegion`
- District-page query: threads applying to riding X without per-request region compilation
- Refresh strategy chosen and documented (incremental vs materialized view refresh)
- Dependency on `[code-applies-to-region]` handled honestly (blocked, landed, or explicit stub)
- No raw participant points or user→region leakage
- Test strategy: single-district, union, jurisdiction-wide membership cases
- Read query/route or service method for district-page listing identified
- Estimated commit size reasonable for one PR

## Respond with
1. Score (1–10) and one-paragraph rationale
2. **Run or amend?** — "Run" if ≥8 with no blockers; otherwise list specific amendments
3. If amend: bullet list of concrete plan changes (not a rewrite of the whole task)
```

### Review agent — QA

```
You are reviewing COMPLETED WORK for [code-entity-audience-projection] (materialized entity_audience projection).

## Your inputs
- The original [code-entity-audience-projection] coding agent prompt
- The implementation (diff, files changed, test output if provided)

## Read for alignment
- docs/entities/partitioning/future.md
- docs/entities/partitioning/entity-rules.md
- public-record/src/schema/postgres.sql.ts — projection DDL
- geo/src/region-resolver.ts

## Rate the work 1–10 on
- `entity_audience` projection DDL exists and populates from `appliesToRegion`
- Resolved district_slug(s)/region correct for single-district, union, and jurisdiction-wide threads (integration tests)
- District-page listing query works without per-request full region compilation
- Refresh/populate path implemented; strategy documented in code or docs
- Built on landed `[code-applies-to-region]` (or honest stub called out in review)
- Entity→region only — no participant point storage or user geo leakage
- Tests pass: `npm test -w @oursay/public-record`, `npm test -w @oursay/geo`, `npm test -w @oursay/api`
- No scope creep (participant geo, privacy schema, custom region admin UI)

## Respond with
1. Score (1–10) and brief rationale
2. **Commit as-is?** Yes or No
3. If Yes: short commit message (imperative, 1–2 sentences, focus on why)
4. If No: brief prompt to send back to the coding agent listing specific fixes only
```

---

## `[code-jurisdiction-graduation]` — JurisdictionRules graduation (policy / create-tier / petition→poll)

**Conversation:** Start **fresh**. Tag: `[code-jurisdiction-graduation]`
**Session ID:** _paste after run_
**Depends on:** `[code-applies-to-verified]` (tier sets), `[code-jurisdiction-labels-limits]` (config shape precedent)

### Coding agent

```
Add a `graduation` policy to `JurisdictionRules` and the petition→poll auto-graduation it implies.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/01-CONTRIBUTOR-SPEC.md §8.6 — canonical ladder & graduation model (open / partial / full)
- docs/entities/partitioning/jurisdiction.md — `graduation` target shape (policy / createTier / petitionToPoll)
- docs/entities/partitioning/future.md — Graduation / promotion config
- docs/GLOSSARY.md — Ladder / graduation, threshold-triggered poll
- public-record/src/jurisdiction.ts — `JurisdictionConfig` / `JurisdictionRules`
- jurisdiction-data/ab-ca-gov/jurisdiction.ts, jurisdiction-data/oursay-global/jurisdiction.ts

## Goals
1. Extend `JurisdictionRules` with `graduation`: `policy` (`open` | `ladder`), `createTier` (record_type → tier set),
   `petitionToPoll` (`{ threshold, deadlineSource: "duration" | "explicit" }`).
2. Populate `ab-ca-gov` (policy `ladder`; `post` open / `petition` residency-verified; poll via `petitionToPoll`)
   and `oursay-global` (policy `open`).
3. Enforce **create-tier gating** per record type at the civic write boundary (reuse the tier-set check from
   `[code-applies-to-verified]`); reject creation below the configured tier with a clear error.
4. Implement **petition→poll auto-graduation**: when a linked petition's verified-signature count reaches
   `petitionToPoll.threshold`, start the pre-attached poll and set its deadline per `deadlineSource`.
   If the signature-count source is not yet available, gate behind a TODO and ship config + create-tier only —
   confirm sequencing with the user.

## Deliverables
- Type + the two jurisdiction-data configs; create-tier enforcement; auto-graduation path (or explicit deferral).
- Tests: AB rejects unverified petition create; global allows direct poll; threshold fires graduation; regenerate `api/openapi.yaml` if shapes change.

## Constraints / Out of scope
- Do not change the four record types or linking semantics (§8.5).
- `some-strict` is a reference model only — do not add it to shipped jurisdiction-data.

## Before you finish
- Run: npm test -w @oursay/public-record, -w @oursay/api; typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan / QA

Use the standard two-block format (rate 1–10; Run/amend then Commit yes/no) as in
`[code-post-content-fields]`. Alignment anchors: §8.6 three models; AB partial-ladder + global open
populated correctly; create-tier is set membership (not a rank ladder); auto-graduation fires only at the
configured threshold and sets the poll deadline per `deadlineSource`; no standalone polls created in AB;
`some-strict` not shipped.

---

## `[code-jurisdiction-binding-fallback]` — Root entity bound to one jurisdiction; oursay-global fallback

**Conversation:** Start **fresh**. Tag: `[code-jurisdiction-binding-fallback]`
**Session ID:** _paste after run_

### Coding agent

```
Assert that every root entity is bound to exactly one jurisdiction, defaulting to oursay-global.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/entities/partitioning/jurisdiction.md — Invariants (binding + fallback)
- docs/entities/civic-content/post.md — R1 (root entity binding)
- docs/GLOSSARY.md — Root entity
- public-record/src/governance.ts, public-record/src/record.ts — where audience/jurisdictionId is set on create
- jurisdiction-data/ — registered jurisdictions (oursay-global always present)

## Goals
1. On root-entity (`post`/`petition`/`poll`) create, require a resolved `jurisdictionId` in the thread audience;
   if none is supplied, default it to `oursay-global` (never leave a root unbound).
2. Reject a create that resolves to an unregistered jurisdiction with a clear error.
3. Confirm comments/reactions/votes/signatures inherit the root's `jurisdictionId` (no independent binding).

## Deliverables
- Create-path default + validation; tests: explicit jurisdiction honoured, absent → oursay-global, unknown → rejected,
  child inherits root jurisdiction.

## Constraints / Out of scope
- Do not change cross-jurisdiction sharing (that is `[crosspost-share]`, future).
- No schema migration unless a NOT NULL is genuinely missing — discuss before destructive changes.

## Before you finish
- Run: npm test -w @oursay/public-record, -w @oursay/api; typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan / QA

Standard two-block format. Anchors: absent jurisdiction defaults to `oursay-global`; unknown jurisdiction
rejected; no root left unbound; children inherit the root's `jurisdictionId`; no crosspost behaviour added.

> **`[crosspost-share]` (future, not scheduled):** sharing a root into an *additional* jurisdiction —
> deferred; see [`docs/entities/civic-content/future.md`](../docs/entities/civic-content/future.md). Do not
> implement under the binding task.

---

## `[code-participation-act-eligibility]` — Participation actTier gate (who may vote/sign/comment/react)

**Conversation:** Start **fresh**. Tag: `[code-participation-act-eligibility]`
**Session ID:** _paste after run_
**Depends on:** `[code-applies-to-verified]` (tier sets), `[code-jurisdiction-graduation]` (createTier precedent)

### Coding agent

```
Add a per-jurisdiction participation act-eligibility gate, distinct from official-count eligibility.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Read first
- docs/10-USER-STORIES.md — "two gates" (act-eligibility vs official-eligibility) + the §3–§5 matrices
- docs/entities/partitioning/jurisdiction.md — `actTier` (participation) target row + Gaps
- docs/entities/partitioning/future.md — Participation act-eligibility (actTier)
- docs/PRD.md §5 — "unverified participants may be blocked from acting on a jurisdiction's verifiable record"
- public-record/src/jurisdiction.ts — JurisdictionRules; public-record/src/record.ts — validateCreate wiring

## Goals
1. Add `actTier` (`action → tier set`) covering `vote` / `petition_signature` / `comment` / `reaction`;
   absent ⇒ permissive default (any registered).
2. Enforce at the civic write boundary — reject an action by a member whose tier ∉ `actTier[action]` with a
   clear error. Keep this SEPARATE from `appliesToVerified` (which only governs whether the action counts in
   the official/signed total, not whether it is permitted).
3. Encode the AB/global/strict matrices once the product `<DECISION>` rows (public-sign? public-vote?) are set —
   confirm those values with the user before populating ab-ca-gov.

## Deliverables
- Type + enforcement + jurisdiction-data values (pending decisions); tests: permitted vs rejected act per tier;
  confirm an unofficial-but-permitted action still records and shows in unofficial counts.

## Constraints / Out of scope
- Do not conflate with `appliesToVerified`; do not change creation gating (that is `[code-jurisdiction-graduation]`).
- `vote`/`petition_signature` webauthn-es256 hard override unchanged.

## Before you finish
- Run: npm test -w @oursay/public-record, -w @oursay/api; typecheck/build.
- Propose a short commit message (do not commit).
```

### Review agent — plan / QA

Standard two-block format. Anchors: `actTier` is **act-permission**, strictly separate from
`appliesToVerified` (official counting); permitted-but-unofficial actions still record and show in
unofficial counts; AB `<DECISION>` rows confirmed with the user before populating; webauthn override intact.
