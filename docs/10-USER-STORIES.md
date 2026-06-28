# OurSay — User Stories

> **Purpose:** The implementation-grade story layer. Each story states a role's goal *and the benefit*,
> plus **acceptance criteria** an agent (or a person) can verify against, the **jurisdiction-tunable
> knobs** involved, a **scope tag**, and **traces** to the authority that owns the rule.
>
> **Audience:** Product, design, and engineering — especially front-end work.

## Where this sits (precedence)

This doc **defers to**, and never redefines, the documents that own the rules:

1. [`GLOSSARY.md`](GLOSSARY.md) — vocabulary wins (use its nouns; do not coin new ones)
2. [`../public-record/REQUIREMENTS.md`](../public-record/REQUIREMENTS.md) — record invariants (`R1`–`R28`)
3. [`entities/`](entities/README.md) — formal object structure
4. [`PRD.md`](PRD.md) §4–§7 — personas, product-level stories, feature requirements
5. [`01-CONTRIBUTOR-SPEC.md`](01-CONTRIBUTOR-SPEC.md) — behavioural narrative

The PRD owns the *persona-level* story summary (§5). **This doc is the layer below it**: the same goals
expressed as verifiable, traced stories that front-end and API work can be built and checked against. If
a story here disagrees with anything above, the source above wins — fix the story.

The next layer down — **per-screen flow specs** (states, components, copy) — will live under
`docs/frontend/` and is written incrementally as each screen is built. This doc is not that; it is the
goal + acceptance layer that those flow specs implement.

## Roles

Most stories use **concrete** roles that map to the trust vocabulary, not invented personas:
`guest` (no account) · `registered` (account, unverified) · `identity-verified` · `residency-verified`
· `subscriber` (a registered user who is a member of the named jurisdiction) · `official` (claimed MLA
profile) · `auditor` · `journalist`. Tiers are **set membership**, not a ladder
([`entities/account/verification.md`](entities/account/verification.md)).

### The parameterized role: `eligible member`

For a civic *action*, **who may do it is jurisdiction config, not a fixed persona** — so a fixed role
would be a category error. The §2 capability stories use a parameterized role:

> **`eligible member`** (for an action, in a jurisdiction) = the set of members the jurisdiction
> authorizes to perform *that* action. It is **resolved from config**, varies per jurisdiction, and
> **may be empty** (∅) — e.g. no one may *directly* create a poll under graduation-only rules; the poll
> exists only by graduating a petition.

Eligibility has **two independent gates** — keep them distinct everywhere:

| Gate | Question | Source |
|------|----------|--------|
| **act-eligibility** | May this member perform the action at all? | jurisdiction config — `graduation.createTier[type]` for *creation*; **participation** act-gating (vote/sign/comment/react) is jurisdiction policy (PRD §5 — *"unverified participants may be blocked from acting on a jurisdiction's verifiable record"*; **config field TBD**, see §6). |
| **official-eligibility** | Does this action count in the **signed/official** total? | the thread's `appliesToVerified` (a tier set). Below it, the action still counts in **unofficial** totals where the jurisdiction permits the act. |

"Public voting, verified-only official counts" = act-eligibility *any registered*, official-eligibility
*residency-verified*. "Verified participants only" = act-eligibility *residency-verified*. Same
capability, two config axes. Each jurisdiction's §3–§5 section opens with an **eligibility matrix** that
sets both gates concretely.

## Story format

```
**US-<area>-<n> — <short title>**  `[scope: MVP | fast-follow | future]`
- **Story:** As a <role>, I want <capability>, so that <benefit>.
- **Acceptance:** verifiable bullets (given/when/then where useful).
- **Eligibility:** who may act (only on action stories; "any viewer" / "n/a" otherwise).
- **Config knobs:** jurisdiction-tunable parameters this story depends on (or "none").
- **Traces:** PRD §x · entity/glossary refs.
```

**Scope tags:** `MVP` = July 18 launch · `fast-follow` = shortly after · `future` = roadmap V1+.

**Canonical reminders** (so stories trace, not re-coin):
- A user's ballot is a **`vote`**; the container is a **`poll`**. Signing is a **`petition_signature`**.
- **Thread audience** = `jurisdictionId` + `appliesToRegion` + `appliesToVerified`, declared on a **root
  entity** (`post`/`petition`/`poll`) and **inherited** by comments/reactions/votes/signatures; it may
  **narrow** but never widen ([`GLOSSARY.md`](GLOSSARY.md), [`entities/partitioning/entity-rules.md`](entities/partitioning/entity-rules.md)).
- **Reveal** links a pseudonymous persona to a profile: a **platform reveal** is reversible, an
  **on-chain reveal** is permanent ([`09-ACCOUNT-PRIVACY-MODEL.md`](09-ACCOUNT-PRIVACY-MODEL.md)).
- **Ladder / graduation** semantics are per-jurisdiction ([`01-CONTRIBUTOR-SPEC.md` §8.6](01-CONTRIBUTOR-SPEC.md)).

---

## 1. System-wide

Behaviour that is genuinely not jurisdiction-specific (account, auth, audit, membership). Roles here are
concrete because the gate is not jurisdiction config.

**US-SYS-1 — Register with email**  `[scope: MVP]`
- **Story:** As a guest, I want to register an account with my email, so that I can participate beyond read-only browsing.
- **Acceptance:** Email-OTP `registration` request → verify creates the account; the response yields a limited **`registration`** session (enroll first passkey only), not `full`; the account is auto-subscribed to `oursay-global`.
- **Eligibility:** any guest.
- **Config knobs:** none (auth is system-wide).
- **Traces:** PRD §6; GLOSSARY *OTP purpose*, *Session scope*, *Jurisdiction membership*; `[code-registration-scope]`.

**US-SYS-2 — Add a passkey**  `[scope: MVP]`
- **Story:** As a registered user, I want to enroll an account-login passkey, so that I can authenticate without relying on email codes.
- **Acceptance:** From a `registration`/`full` session the user enrolls a WebAuthn **account-login passkey**; logging in with it yields a `full` session; additional passkeys may be enrolled per device (additive — does not revoke other sessions).
- **Eligibility:** any registered user.
- **Config knobs:** none.
- **Traces:** PRD §6; GLOSSARY *Account-login passkey*, *Add device*.

**US-SYS-3 — Recover a lost device**  `[scope: MVP]`
- **Story:** As a registered user, I want to recover my account by email if I lose my passkey/device, so that losing a device never locks me out.
- **Acceptance:** A `recovery` OTP yields a recovery-scope session that may **only** enroll a fresh passkey; recovery **revokes all prior sessions**; the persona `Pₜ` and thread bindings are **preserved** (the user re-authorizes per thread by enrolling a fresh credential under the same `Pₜ`).
- **Eligibility:** any registered user (account-exists check, no enumeration).
- **Config knobs:** none.
- **Traces:** PRD §6; `08-IDENTITY-AND-DEVICE-POLICY.md` (recovery revocation model); GLOSSARY *Session scope*.

**US-SYS-4 — Provide ID to become verified**  `[scope: MVP]`
- **Story:** As a registered user, I want to verify my identity (and, for residency, my address) through the KYC provider, so that my civic actions count at a verified tier.
- **Acceptance:** The flow uses **Didit** (dev: ID-only + platform self-signed address; prod: proof-of-address ~$2 CAD); the user reviews and consents to the **exact at-cost price before paying**; on pass the platform awards the tier and writes a public-record entry linking the **pseudonymous** identity to the tier — **no PII**. Residency verification is **not** electoral eligibility.
- **Eligibility:** any registered user.
- **Config knobs:** verification provider + which tiers a jurisdiction recognizes.
- **Traces:** PRD §7.4; `entities/account/verification.md`; GLOSSARY *Didit*, *Verification tier*; `[code-didit-provider]`.

**US-SYS-5 — Recovery re-verifies a verified account**  `[scope: MVP]` *(constraint, written as a story for the benefit it gives)*
- **Story:** As a verified user, I want recovery to require KYC re-verification, so that a stolen email cannot silently inherit my verified standing.
- **Acceptance:** During recovery, if the account holds a KYC attestation, the flow requires re-verification with the provider before restoring verified tier; an unverified account simply re-enrolls a passkey.
- **Eligibility:** verified users (during recovery).
- **Config knobs:** verification provider (re-verify path).
- **Traces:** `08-IDENTITY-AND-DEVICE-POLICY.md` (KYC-gated recovery); `[mvp-c-kyc-provider]`.

**US-SYS-6 — Subscribe to multiple jurisdictions**  `[scope: MVP — foundation; populated feed best-effort]`
- **Story:** As a registered user, I want to be a member of more than one jurisdiction, so that I can participate wherever I have standing.
- **Acceptance:** A membership API records `user ↔ jurisdiction`; every account is auto-subscribed to `oursay-global`; membership is what the UI jurisdiction-selector and "my jurisdictions" read from. At launch only `ab-ca-gov` is reachable through the UI; the *foundation* (membership + selector) ships regardless.
- **Eligibility:** any registered user, subject to a jurisdiction's join gate (public vs residency-gated — see US-STR-1).
- **Config knobs:** which jurisdictions are public/joinable; residency-gated (private) subscribe.
- **Traces:** PRD §3, §6; ROADMAP MVP (multi-jurisdiction foundation); `[mvp-c10b-membership]`.

**US-SYS-7 — Unified, filterable feed**  `[scope: MVP — components; populated multi-chain best-effort]`
- **Story:** As a member of multiple jurisdictions, I want one feed across my subscriptions that I can filter by jurisdiction, so that I see everything relevant in one place without losing the per-jurisdiction view.
- **Acceptance:** The feed renders rows carrying `jurisdictionId`, `entityId`, `type`, `audienceScope`; a jurisdiction filter derives from the membership API; the **component works with a single active chain** (a one-option selector may be hidden). Populating it across multiple live chains depends on `[mvp-c10]`.
- **Eligibility:** any member (per-row gating comes from each jurisdiction's `countGating`).
- **Config knobs:** none.
- **Traces:** PRD §3, §6; API-GAPS "Future UI assumptions"; `[mvp-c10-multi-jurisdiction]`.

**US-SYS-8 — Audit the public record**  `[scope: MVP]`
- **Story:** As an auditor, I want a full copy of the public record and a way to recompute any published total offline, so that I can confirm OurSay published the truth without trusting its servers.
- **Acceptance:** A full sync/stream of the record is available beyond the app's read endpoints; published aggregate counts are covered by **signed count manifests** so a silent change is detectable; an offline verifier checks commitments → per-entity chains → roots against an independently obtained anchor.
- **Eligibility:** anyone (no account needed).
- **Config knobs:** none.
- **Traces:** PRD §2b, §7.7; `05-TRUST-REVIEW.md`; `[mvp-c13-signed-count-snapshots]`.

**US-SYS-9 — Detect improper censorship**  `[scope: MVP]`
- **Story:** As an auditor holding a full copy of the record, I want to prove what a record contained, so that I can hold the platform accountable if it removes content improperly.
- **Acceptance:** Every action (including removed comments) has a commitment + ledger hash, so existence and prior content are provable from a held copy + salt/receipt; removal is visible against the append-only history rather than silent.
- **Eligibility:** any auditor with a held copy.
- **Config knobs:** none.
- **Traces:** PRD §7.7; `01-CONTRIBUTOR-SPEC.md` §10, §11.

**US-SYS-10 — Journalist-grade trust**  `[scope: MVP]`
- **Story:** As a journalist, I want district-level verified counts I can cite with an audit reference, so that I can report OurSay numbers the way I cite election results.
- **Acceptance:** Public read API exposes counts by district and tier with an audit reference and **no PII**; closed-vote numbers are presented honestly (signed snapshot where available, otherwise labelled live recompute); narrow buckets are suppressed below the k-anonymity floor.
- **Eligibility:** any viewer.
- **Config knobs:** `counts` exposure + `privacy.kAnonymityFloor` per jurisdiction.
- **Traces:** PRD §7.5, §7.7; `06-PRIVACY-REVIEW.md`.

---

## 2. Capabilities (jurisdiction-parameterized)

The civic capabilities, **mechanics stated once**. The *who* is the parameterized `eligible member`;
each jurisdiction's matrix (§3–§5) resolves it. Unless a matrix says otherwise, **assume public-record
inclusion** for verified actions.

**US-CAP-1 — Create a statement**  `[scope: MVP]`
- **Story:** As a member eligible to create a statement here, I want to create one (`post`), so that I can put a view to the community.
- **Acceptance:** `title` required (≤200), `body` optional (≤2000), enforced from `contentLimits`; the `post` is a **root entity** bound to that `jurisdictionId` (default `oursay-global` if unchosen); it appears in the jurisdiction's feed and public record.
- **Eligibility:** `graduation.createTier.post` (may be *any registered* … through *residency-verified*).
- **Config knobs:** `labels.post`, `contentLimits.post`, `graduation.createTier.post`.
- **Traces:** PRD §7.1; `entities/civic-content/post.md`; GLOSSARY *Root entity*.

**US-CAP-2 — React to content**  `[scope: MVP]`
- **Story:** As a member eligible to react here, I want to agree or disagree on a statement/comment, so that I can register a position without writing.
- **Acceptance:** A `reaction` is `check` (agree) or `cross` (disagree), **mutually exclusive** — one active reaction per author + parent; position is changeable; verified reactions are on-ledger, unverified off-ledger; counts show total and **by tier**.
- **Eligibility:** participation act-eligibility for `reaction` (jurisdiction policy; config field TBD — §6).
- **Config knobs:** participation act-eligibility; (reaction kinds fixed for MVP).
- **Traces:** PRD §7.1; `entities/civic-content/reaction.md`; `01-CONTRIBUTOR-SPEC.md` §9.1, §9.4.

**US-CAP-3 — Comment on a thread**  `[scope: MVP]`
- **Story:** As a member eligible to comment here, I want to comment on any root entity or result (and reply to comments), so that I can discuss, not just signal.
- **Acceptance:** A `comment` (`body` ≤ `contentLimits.comment`) attaches to a parent and **inherits the root's audience**; threaded replies reference a parent comment; every comment — including moderator-removed ones — carries a ledger hash.
- **Eligibility:** participation act-eligibility for `comment` (jurisdiction policy; config field TBD — §6).
- **Config knobs:** `contentLimits.comment`, participation act-eligibility.
- **Traces:** PRD §7.1; `01-CONTRIBUTOR-SPEC.md` §10; `entities/civic-content/comment.md`.

**US-CAP-4 — Create a petition**  `[scope: MVP]`
- **Story:** As a member eligible to create a petition here, I want to create one addressed to a named authority, so that I can make a formal call to action.
- **Acceptance:** create permission is gated by `graduation.createTier.petition`; the petition is a root entity bound to a jurisdiction; `addressedTo` is inferred from its audience (platform-overridable); optional deadline; status open|closed|delivered|responded.
- **Eligibility:** `graduation.createTier.petition` (**may be ∅** where petitions are graduation-only).
- **Config knobs:** `graduation.createTier.petition`, `defaultDeadline`, `labels.petition`, `contentLimits.petition`.
- **Traces:** PRD §7.2; `entities/civic-content/petition.md`.

**US-CAP-5 — Sign a petition**  `[scope: MVP]`
- **Story:** As a member eligible to sign here, I want to sign a petition, so that I add my weight to a formal call to action.
- **Acceptance:** signature is `webauthn-es256`; optional comment **hidden if anonymous**; **final by default** (revoke only where `allowRevoke` + before deadline); inherits the petition's audience; counts officially only if the signer's tier ∈ `appliesToVerified`, else in **unofficial** counts where the act is permitted.
- **Eligibility:** participation act-eligibility for `petition_signature` (jurisdiction policy; config field TBD — §6). **Official-eligibility:** `appliesToVerified`.
- **Config knobs:** participation act-eligibility, `appliesToVerified`, `allowRevoke`, `defaultDeadline`.
- **Traces:** PRD §7.2; `entities/civic-content/petition-signature.md`; `01-CONTRIBUTOR-SPEC.md` §9.2.

**US-CAP-6 — Attach / graduate a petition into a poll**  `[scope: MVP — graduation impl is a gap]`
- **Story:** As a petition creator, I want to pre-attach a poll that starts if the petition succeeds, so that the community can decide the question formally.
- **Acceptance:** the creator links a `poll` to the petition; where the jurisdiction sets `graduation.petitionToPoll`, the poll **starts automatically** when the petition reaches the verified-signature threshold, deadline set per `deadlineSource`; otherwise the link is informational and the poll follows direct-create eligibility.
- **Eligibility:** petition creator (to pre-attach); the graduation itself is automatic (no actor).
- **Config knobs:** `graduation.policy`, `graduation.petitionToPoll` (threshold + deadline source).
- **Traces:** PRD §1, §7.3; `01-CONTRIBUTOR-SPEC.md` §8.6; GLOSSARY *Ladder / graduation*; `[code-jurisdiction-graduation]`.

**US-CAP-7 — Vote in a poll**  `[scope: MVP]`
- **Story:** As a member eligible to vote here, I want to cast a `vote`, so that my choice counts in the formal outcome.
- **Acceptance:** `vote` is `webauthn-es256`; **final once cast by default** (change only where `allowChange` + before deadline); one active vote per author + poll; anonymous verified votes are on-ledger showing tier only (e.g. "Residency Verified — Anonymous"); counts officially only if the voter's tier ∈ `appliesToVerified`, else unofficial.
- **Eligibility:** participation act-eligibility for `vote` (jurisdiction policy; config field TBD — §6; **may be ∅** if a jurisdiction has no open poll path). **Official-eligibility:** `appliesToVerified`.
- **Config knobs:** participation act-eligibility, `appliesToVerified`, `allowChange`, deadline source.
- **Traces:** PRD §7.3; `entities/civic-content/vote.md`, `poll.md`; `01-CONTRIBUTOR-SPEC.md` §9.3.

**US-CAP-8 — See a result**  `[scope: MVP (Should) — live recompute until c12]`
- **Story:** As anyone, I want to see a closed poll's result with its breakdowns and audit reference, so that I can trust and trace the outcome.
- **Acceptance:** counts per option (total | by tier | by district) + audit reference; until the formal derived `result` lands, outcomes shown honestly as **live recompute**; immutable once published.
- **Eligibility:** any viewer (incl. guests).
- **Config knobs:** `counts` exposure, `kAnonymityFloor`.
- **Traces:** PRD §7.3; `entities/civic-content/result.md`; `[mvp-c12-poll-results]`.

**US-CAP-9 — Choose anonymity per thread**  `[scope: MVP for anonymous-by-default; richer reveal V1]`
- **Story:** As a participant, I want to choose whether each thread is anonymous or linked to my profile, so that I control my exposure conversation by conversation.
- **Acceptance:** participation is **pseudonymous by default** (per-thread persona `Pₜ`); a **platform reveal** links persona→profile and is **reversible**; changing anonymity later applies to platform reveals only.
- **Eligibility:** any participant in the thread.
- **Config knobs:** account/jurisdiction/thread visibility cascade (V1).
- **Traces:** `08-IDENTITY-AND-DEVICE-POLICY.md` §4; GLOSSARY *Reveal*; `[code-privacy-schema]`.

**US-CAP-10 — Irrevocably reveal to the public record**  `[scope: future (V1)]`
- **Story:** As a participant, I want to permanently link my identity to my records on the public record, so that anyone can verify it was me **without trusting the platform**.
- **Acceptance:** an **on-chain reveal** is explicitly **nuclear/permanent** and cannot be undone (contrast US-CAP-9); the UI requires explicit, informed confirmation distinguishing it from the reversible platform reveal.
- **Eligibility:** any participant (over their own records).
- **Config knobs:** none.
- **Traces:** GLOSSARY *Reveal* (on-chain = nuclear); `09-ACCOUNT-PRIVACY-MODEL.md`.

**US-CAP-11 — Official vs unofficial counts**  `[scope: MVP]`
- **Story:** As a verified resident, I want my actions in the **official** signed counts while lower-tier participation still shows in **unofficial** counts, so that the verified signal is distinct but no one is silenced.
- **Acceptance:** official totals (signed to the record) include only tiers ∈ `appliesToVerified`; unofficial counts include permitted lower tiers; both are visibly distinguished; unverified participation, where permitted, is counted and labelled separately — never misleadingly merged.
- **Eligibility:** n/a (read/aggregation rule). This is the **official-eligibility** gate referenced throughout §2.
- **Config knobs:** `appliesToVerified` (per thread), `counts.minTier`.
- **Traces:** PRD §1, §7.5; `entities/partitioning/entity-rules.md`; `[code-applies-to-verified]`.

**US-CAP-12 — Filter by my district**  `[scope: MVP for counts; my-district auth context c4c]`
- **Story:** As a residency-verified resident, I want to filter any count to my own district and compare it to the province, so that I can see how my area's verified residents line up.
- **Acceptance:** district membership is **inferred from address at query time, never stored on the user row**; counts are filterable by region (district/preset/jurisdiction) AND tier, combinable; narrow buckets suppressed below `kAnonymityFloor`.
- **Eligibility:** any viewer (the *my-district* convenience needs the viewer's verified address).
- **Config knobs:** `kAnonymityFloor`, `counts` exposure.
- **Traces:** PRD §7.5; `REGION-MODEL.md`; GLOSSARY *District*, *Region*; `[mvp-c4c-my-district]`.

---

## 3. `ab-ca-gov` (Alberta)

Partial ladder ([`01-CONTRIBUTOR-SPEC.md` §8.6](01-CONTRIBUTOR-SPEC.md)). `graduation.policy = ladder`;
`labels.district = riding`. The matrix resolves §2's `eligible member`; below it, only true deltas.

### Eligibility matrix

| Action | May act (act-eligibility) | Counts officially (`appliesToVerified`) | Notes |
|--------|---------------------------|------------------------------------------|-------|
| create `post` (Statement) | any registered subscriber | — (reactions counted by tier) | open |
| react / comment | any registered subscriber | by tier | |
| create `petition` | `residency-verified` | — | |
| sign `petition` | **`<DECISION>`** — any registered, or residency-verified? | `residency-verified` | public-sign vs verified-only |
| create `poll` | **∅ (graduation-only)** | — | poll via petition graduation |
| `vote` | **`<DECISION>`** — public voting, or verified-only? | `residency-verified` | the classic "public vote, verified count" choice |

> `<DECISION>` rows are **open product decisions**, captured here on purpose. Set them in the
> jurisdiction's act-eligibility config once decided; until then the front end must not assume.

### Deltas

**US-AB-1 — Poll only by graduation**  `[scope: MVP — graduation impl is a gap]`
- **Story:** As a petition creator, I want my attached poll to start when the petition reaches the signature threshold, so that polls in Alberta carry the weight of a successful petition.
- **Acceptance:** no standalone poll creation (matrix: create `poll` = ∅); a poll exists only via `graduation.petitionToPoll`; platform sets the poll deadline; a `result` derives at close.
- **Eligibility:** none may directly create a poll; graduation is automatic.
- **Config knobs:** `graduation.petitionToPoll` (threshold + deadline source).
- **Traces:** §8.6; specializes US-CAP-6/US-CAP-7; `[code-jurisdiction-graduation]`.
- **Open question:** deadline as explicit timestamp vs inferred duration → `graduation.petitionToPoll.deadlineSource`.

**US-AB-2 — District-distinguished participation**  `[scope: MVP]`
- **Story:** As a residency-verified resident of a district, I want district-filtered threads to distinguish my participation from residency-verified users **outside** my district's region, so that local signal is not diluted by out-of-area verified users.
- **Acceptance:** a thread's `appliesToRegion` resolves my inferred address against the named region; counts separate in-region from out-of-region residency-verified participation; district label displays as **"riding"**.
- **Eligibility:** residency-verified residents.
- **Config knobs:** `appliesToRegion`, `labels.district = riding`.
- **Traces:** PRD §7.5; `entities/partitioning/entity-rules.md`; `[code-applies-to-region]`.

**US-AB-3 — Official claims a profile**  `[scope: fast-follow]`
- **Story:** As a verified official, I want to claim my auto-generated profile, so that my participation is attributable and builds trust.
- **Acceptance:** auto-generated read-only MLA profiles exist at launch with a "not endorsed / may be unaware" disclaimer; the **claim workflow** is fast-follow (not a July 18 blocker); on claim, the official's posts/comments/reactions may link to the profile.
- **Eligibility:** the verified official for that constituency.
- **Config knobs:** none.
- **Traces:** PRD §3, §6, §7.6; `01-CONTRIBUTOR-SPEC.md` §4.5.

**US-AB-4 — Official sees their constituency's verified will**  `[scope: fast-follow]`
- **Story:** As a verified official, I want results from threads whose audience includes my district (or jurisdiction-wide) where my district's verified residents participated, so that I can see constituent sentiment without commissioning a poll.
- **Acceptance:** official view aggregates threads whose `appliesToRegion` covers the official's district, broken down by tier; respects `countGating` and `kAnonymityFloor`.
- **Eligibility:** claimed officials.
- **Config knobs:** `counts`, `kAnonymityFloor`.
- **Traces:** PRD §7.6; `03-OUTREACH-TEMPLATE.md`.

**US-AB-5 — Selective profile visibility**  `[scope: future (V1)]`
- **Story:** As a residency-verified resident, I want the option to let only my official and/or other verified district residents see the profile linked from my otherwise-anonymized records, so that I can be known locally without being public.
- **Acceptance:** visibility resolves via the cascade `anonymous | my_district | officials | public` (V1); widening overrides rejected; out-of-scope viewers get 404 (not 403).
- **Eligibility:** residency-verified residents (over their own records).
- **Config knobs:** account/jurisdiction/thread visibility (narrow-only).
- **Traces:** `09-ACCOUNT-PRIVACY-MODEL.md`; ROADMAP V1; `[code-privacy-schema]`.

---

## 4. `oursay-global`

The **open** model — `graduation.policy = open`; the fallback every account joins at registration.

### Eligibility matrix

| Action | May act (act-eligibility) | Counts officially (`appliesToVerified`) | Notes |
|--------|---------------------------|------------------------------------------|-------|
| create `post` / react / comment | any registered | by tier | |
| create `petition` | any registered | by tier | no graduation gate |
| sign `petition` | any registered | `<DECISION>` — identity-verified default? | permissive act; official set configurable |
| create `poll` | any registered | by tier | **standalone polls allowed** |
| `vote` | any registered | `<DECISION>` — identity-verified default? | public voting |

### Deltas

**US-GLB-1 — Control deadlines and promotion**  `[scope: MVP (config); auto-promotion impl is a gap]`
- **Story:** As a creator, I want to set custom deadlines/durations and control automatic promotion settings, so that I tune a thread's lifecycle myself.
- **Acceptance:** creator may set an explicit deadline or duration and opt a petition into/out of auto-graduation; defaults fall back to `defaultDeadline`.
- **Eligibility:** any registered creator.
- **Config knobs:** `defaultDeadline`, `graduation.petitionToPoll` (opt-in here).
- **Traces:** §8.6; `entities/partitioning/entity-rules.md`.

**US-GLB-2 — Filter verified from unverified**  `[scope: MVP]`
- **Story:** As an identity-verified user, I want counts filterable to exclude unverified public users, so that I can read the verified signal alone.
- **Acceptance:** counts accept a tier-set filter (set membership, not a ladder); the unfiltered total remains available; k-anonymity still applies.
- **Eligibility:** any viewer.
- **Config knobs:** `counts.minTier`.
- **Traces:** PRD §7.5; `entities/account/verification.md`.

**US-GLB-3 — Filter other residency-verified opinions by region**  `[scope: future (V1 filters)]`
- **Story:** As a residency-verified user, I want to filter out residency-verified opinions from outside my own area (globally, by country), so that I can isolate my locale at any scale.
- **Acceptance:** region filtering composes And/Or/Not across presets up to whole-jurisdiction extents; resolves the viewer's inferred address; respects k-anonymity.
- **Eligibility:** any viewer.
- **Config knobs:** region presets.
- **Traces:** ROADMAP V1 (filtering); `REGION-MODEL.md`; `[mvp-c5-region-presets]`.

---

## 5. `some-strict`

A **full-ladder**, **private** jurisdiction — the strictest reference model. Used to prove the
configuration space, not a launch deployment.

### Eligibility matrix

| Action | May act (act-eligibility) | Counts officially (`appliesToVerified`) | Notes |
|--------|---------------------------|------------------------------------------|-------|
| create `post` | `residency-verified` | `residency-verified` | |
| react / comment | `residency-verified` | `residency-verified` | district-scoped (US-STR-2) |
| create `petition` | `residency-verified` | `residency-verified` | must be reached via ladder |
| sign `petition` | `residency-verified` | `residency-verified` | |
| create `poll` | ∅ (graduation-only) | `residency-verified` | full ladder, `policy = ladder` |
| `vote` | `residency-verified` | `residency-verified` | verified-only voting |

### Deltas

**US-STR-1 — Residency-gated subscribe**  `[scope: future]`
- **Story:** As a residency-verified resident of this jurisdiction, I want to subscribe to it (and others cannot), so that participation is limited to verified residents.
- **Acceptance:** membership join requires residency verification within the jurisdiction; non-residents cannot subscribe or see gated content; the jurisdiction is marked private in the catalog.
- **Eligibility:** residency-verified residents of this jurisdiction only.
- **Config knobs:** membership join gate (residency-required); private-jurisdiction flag.
- **Traces:** specializes US-SYS-6; `[mvp-c10b-membership]`.

**US-STR-2 — District-exclusive threads**  `[scope: future]`
- **Story:** As a verified resident of a district, I want to be confident that only other verified district residents can comment on a post I designate solely to my district, so that a local thread stays local.
- **Acceptance:** the post's `appliesToRegion` is the district and `appliesToVerified` is residency-verified; inherited by comments/reactions; audience may narrow but never widen; a non-resident's attempt is rejected (and counts never expose them).
- **Eligibility:** verified residents of the named district.
- **Config knobs:** `appliesToRegion`, `appliesToVerified`.
- **Traces:** GLOSSARY *Thread audience*; `entities/partitioning/entity-rules.md`.

---

## 6. Cross-cutting gaps surfaced by these stories

Tracked so they are not lost; each has a home in the gap docs:

- **Participation act-eligibility config** — *who may vote/sign/comment/react* is jurisdiction policy
  (PRD §5), but only **creation** has a config field today (`graduation.createTier`). Formalize a
  parallel participation act-eligibility map (or generalize `createTier` into an `actTier` covering all
  actions). Until then, the `<DECISION>` matrix rows above cannot be encoded. (`[code-participation-act-eligibility]`)
- **Graduation engine** — per-jurisdiction `graduation` config + auto petition→poll worker (`[code-jurisdiction-graduation]`).
- **Jurisdiction binding + fallback** — assert every root binds to one jurisdiction, default `oursay-global` (`[code-jurisdiction-binding-fallback]`).
- **Multi-jurisdiction UI seams** — selector + unified-feed components ship even with one active chain (`[mvp-c10b-membership]`, `[mvp-c10-multi-jurisdiction]`).
- **Share / crosspost** — sharing a root into another jurisdiction is **future**, intentionally not MVP ([`entities/civic-content/future.md`](entities/civic-content/future.md), `[crosspost-share]`).

---

_This doc grows as front-end work proceeds; add the per-screen flow specs under `docs/frontend/` rather
than expanding stories into UI detail here._
