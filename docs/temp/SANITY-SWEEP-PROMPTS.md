# Sanity Sweep — Single Doc Pass

Copy the blocks below into Cursor agent chats.

---

## Coding agent (doc sweep + spawn code tasks)

See the full prompt in project chat / paste from the canonical block below.

```
OurSay sanity sweep — documentation only. Align all docs to the locked decisions below. Do NOT change application code, schema, or OpenAPI in this pass.

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

When doc changes imply codebase alignment, add new task prompts to `.agents/` (same style as `.agents/MVP-PROMPTS.md`: tag, summary, Read first, Goals, Deliverables, optional Review agent block). One prompt per logical code task. Do not implement those tasks in this pass.

Do not git commit unless the user explicitly asks.

---

## Locked decisions (authoritative)

### Vocabulary split
- **Engineering / contributor / entity docs:** record types `post`, `petition`, `poll`, `result`, `vote`, `petition_signature`. API routes stay `/v1/public/posts`. Never use Belief/Statement/Public Vote as canonical dev terms.
- **User-facing labels:** `JurisdictionConfig.labels` per jurisdiction. Defaults: Statement, Petition, Poll, Result. AB launch: Statement for `post`, `riding` for district label. `oursay-global` = all defaults.
- **No blind replace-all** of "belief" or "vote" — legitimate uses exist in prose, ballot entity, etc.

### Content hierarchy (product)
Statement → Petition → Poll → Result. Internal: post → petition → poll → result.

### Post field model (document as target; note code drift)
- `title` required, max 200; `body` optional, max 2000. Current `PostContent` inverts this — mark gap.

### Poll
- Product label **Poll** (rollback from Public Vote). Record type `poll`. Ballot = `vote`. "Public vote" only when meaning a user's ballot, not the poll container.

### JurisdictionConfig (document shape)
Add to docs: `labels` (post/petition/poll/result/district) and `contentLimits` (hard caps per type). AB example limits: post 200/2000, comment body 2000, petition title 200 text 5000, poll question 200 option 100 max 10 options description 2000.

### Thread audience (root entities only; votes/comments/reactions inherit)
- `jurisdictionId` required on every thread.
- **`appliesToRegion`** (target): geographic stake — `jurisdiction`, `riding:<riding_slug>`, `district:<revisionId>`, `region:<presetId>`, unions. Stable district pages use `riding_slug`.
- **`appliesToVerified`** (target): min KYC tier set for stake/official counts.
- **Deprecate `appliesToDistrictIds`** in docs (still in code today). Future: materialized `entity_audience` projection for district-page listing — document in partitioning/future.md.

### Petition addressedTo
Inferred by default; platform/moderation override. District-scoped → MLA(s) as secondary recipients. Jurisdiction-wide → legislature (AB: LA). Explicit **constitutional checkbox** → Minister/LG. Recipients: leg, minister, agency, office, ministry, governing body — not profile-only.

### Entity rules
Jurisdiction defaults authoritative for MVP. Entity-level rules = platform-only stub (official polls/petitions), not user-accessible. Unify allowChange/allowRevoke → single `allowChange` future field. Deadline gates submit AND change/revoke. Document future optional on-record "intent" txs when changes rejected (transparency for officials) — discussion only.

### Result
Narrow result.md to poll close + near-term publish. Broad future (petitions, bills, official outcomes) → civic-content/future.md.

### Platform-signed records (document, unimplemented)
Final tallies, tally amendments, censorship reasoning, district boundary revisions, official profiles (MLA/premier/agency). Comments/reactions on official records — future.

### Verification
Tiers + provider tags on attestations (orthogonal). Badges on profiles and anonymous thread personas. **Didit** MVP provider (ID-only, ~$2, dev free tier) — document recent decision. Platform self-sign address (POA-ready). Equifax/electoral tags — future only. **Never** imply Elections Alberta partnership. Residency ≠ electoral eligibility. Target `over_18` bool; drop stored DOB if KYC/recovery can re-prompt (note current birthdate column gap).

### Account
Jurisdiction membership table; auto `oursay-global` on register; future geocode-suggested subscribe. Revise `docs/09-ACCOUNT-PRIVACY-MODEL.md`: enum `anonymous | my_district | officials | public`; cascade `thread ?? jurisdiction ?? account ?? anonymous`; thread cannot widen; 404 out-of-scope. Reveal model replaces thread `claimed`/`claimed_at` — remove from entity specs; deprecated columns until migration; platform reveal reversible, on-chain reveal nuclear.

### Auth (document target; code gaps)
Passkey: one per **enrolled authenticator**. Target: OTP registration → **`registration`** scope (enroll passkey only); **`full`** after passkey login. Today registration issues `full` — document gap in auth/future.md.

### Region
Keep term Region. Multi-jurisdiction regions possible in theory; discussions always jurisdiction-scoped. Path forward in partitioning/future.md. `appliesToRegion` over raw district id arrays.

### District pages
`riding_slug` stable key; revision slugs for history. Platform signs boundary changes — future.

### Filtering (ROADMAP emphasis)
Ongoing staged work: And/Or/Not (not Xor), residency-at-time, tier sets, provider tags, deadline snapshots for official poll/signature counts.

### Social tagging
One-liner in contributor spec: future `#`/`@` links — UI concern.

### Doc deliverables
1. GLOSSARY + entities/README (precedence: glossary wins)
2. Entity specs: rename `belief.md` → `post.md`, `public-vote.md` → `poll.md`; update all links
3. `future.md` per entity subfolder **only where gaps exist** (account, auth, civic-content, civic-identity, partitioning, record)
4. Revise PRD, 01-CONTRIBUTOR-SPEC, 09-ACCOUNT-PRIVACY-MODEL, REGION-MODEL
5. **`docs/ROADMAP.md`** — Current → MVP → V1 → V2 (vaguer downstream: ZK, RPC, chain sync, WYSIWYS/WebAuthn, browser plugin, mobile, forkable KYC for election commissions). Use `git log` for what's landed.
6. **`docs/API-GAPS-AND-ROADMAP.md`** — add banner pointing to ROADMAP; do not delete file
7. Final ripgrep audit for stray Belief/Public Vote/deprecated terms without context

Pick doc edit order yourself (token-efficient phased sweep OK in one session).

### Code alignment spawn rule
For every doc/code mismatch you document, add a matching prompt file under `.agents/` named e.g. `CODE-[tag]-short-name.md` OR append to a new `.agents/CODE-ALIGNMENT-PROMPTS.md` with MVP-PROMPTS-style blocks. Include: tag, why (doc reference), Read first paths, Goals, Deliverables, Out of scope. Examples likely needed: registration scope, JurisdictionConfig labels/contentLimits, PostContent fields, appliesToRegion migration, drop claimed columns, over_18, Didit provider, privacy schema, entity_audience projection.

End with a short summary: files changed, future.md index, list of `.agents/` code prompts created, suggested commit message(s). Do not commit.
```

---

## Review agent (optional, after doc pass)

```
Review the OurSay sanity-sweep doc pass (documentation only — no code should have changed).

**No assumptions — ask the user for clarification when requirements, wire format, or scope are ambiguous.**

## Check against locked decisions
- GLOSSARY is vocabulary authority; no engineering doc uses Belief/Public Vote as canonical terms
- post/poll renames and link integrity (post.md, poll.md)
- appliesToDistrictIds deprecated; appliesToRegion + appliesToVerified documented
- 09 privacy enum + cascade + thread cannot widen
- claimed removed from thread-persona; reveal in future.md
- Didit MVP documented; no Elections Alberta partnership implied
- elector language cleaned (except electoral_validated tier name)
- docs/ROADMAP.md exists and reflects git history + filtering priority
- API-GAPS banner links to ROADMAP
- `.agents/` contains code-alignment task prompts for every documented code gap (MVP-PROMPTS style)

## Output
Score 1–10. Bullet list of blockers vs nits. Do not commit.
```
