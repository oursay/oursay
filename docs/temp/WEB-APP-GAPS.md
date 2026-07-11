# WEB-APP-GAPS — docs ↔ web-app alignment map

The Phase D `web-app` demo made real product policy while the docs were frozen on the sanity-sweep
decisions. This document is the map of what changed: for every conflict — the **old assumption**, the
**proposed change**, the **web-app policy that forced the rethink and why**, and the **affected docs
and lines**. It also carries the proposed Postgres schema changes, the API endpoint list (with the
frontend feature each powers), and points to the action plan in
[`WEB-APP-ALIGNMENT-PROMPTS.md`](./WEB-APP-ALIGNMENT-PROMPTS.md).

Line numbers were captured 2026-07-04 against the current tree; treat them as anchors, not gospel —
re-grep before editing.

**Companions:** [`docs/API-GAPS-AND-ROADMAP.md`](../docs/API-GAPS-AND-ROADMAP.md) ·
[`web-app/src/lib/api/CONTRACT.md`](../web-app/src/lib/api/CONTRACT.md) (frontend's own gap list —
still valid; this doc supersedes it only where they disagree) ·
[`.agents/SANITY-SWEEP-PROMPTS.md`](./SANITY-SWEEP-PROMPTS.md) (the decisions being partially reversed).

---

## Locked decisions (2026-07-03, authoritative)

1. **Soft keys stay.** Quick-sign (derived P-256) is a permanent first-class signing method, not a
   deprecated legacy path. Users set per-action signing preferences; jurisdictions set per-type,
   per-gate minimums; **the most secure option wins**.
2. **District ids stay alongside region.** Both `appliesToRegion` (geo filtering) and the district-id
   list (frontend per-thread district resolution) are kept. Neither deprecates the other.
3. **Least-resistance registration.** No legal name or address at registration — those are KYC-step
   inputs. Registration is email OTP + handle + display name.
4. **Handle and display name are required** (no longer optional on the user row). Profiles may be
   **private**: an out-of-scope viewer gets **404**, following the same anonymity patterns as posts
   and comments.
5. **Jurisdiction gate configs** (the `<DECISION>` markers in 11-USER-FLOWS are now answered):
   - **Global (`oursay-global`)** — very relaxed. Anyone may create any record type, regardless of
     signing method or KYC level. Anyone may vote and sign petitions. **Official counts for votes and
     signatures use ID verification only** (`identity_verified`-or-better tier set).
   - **Alberta (`ab-ca-gov`)** — anyone may participate in statements, but statements **must be
     passkey-signed (WebAuthn `uv` flag)**. Comments and reactions **may be quick-signed**. Voting and
     petition-signing **require passkey signing**. Voting additionally requires **jurisdiction
     residency verification to participate**. Petitions: **anyone may sign** (sign now, verify later),
     but **official counts use jurisdiction residency verification**. **Only officials may create
     polls** (not yet reflected in the web-app).

---

## Part 1 — Conflicts and changes (the map of docs to change)

### C1. Soft keys un-deprecated: per-action signing prefs + per-gate jurisdiction floors

- **Old assumption:** The derived-P-256 path is a legacy "dual-verifier period" capability to be
  retired; `vote` and `petition_signature` **hard-require** `webauthn-es256` platform-wide
  (`requiredSignScheme()` ignores jurisdiction config); the only signing knob is
  `JurisdictionRules.signing.defaultScheme`.
- **Proposed change:** Signing method is a **two-sided resolution**: the account's per-action
  preference (`quick | ask | passkey`) vs the jurisdiction's per-action minimum, **strongest wins**.
  The platform-wide hard override is removed — Global genuinely allows quick-signed votes and
  signatures; Alberta mandates passkey (`uv`) for statements, votes, and signatures while leaving
  comments/reactions quick-signable. Replace `signing.defaultScheme` with a per-action floor map
  (see Part 3 config shape). The engine's `p256` verifier branch is promoted from "legacy" to the
  quick-sign production path. `signTier` (0 quick · 1 passkey · 2/3 biometric-future) is projected
  onto every read DTO, derived from envelope `signScheme` + authenticator UV/metadata.
- **Web-app policy that forced this, and why:** `web-app/src/lib/types/signing.ts` (SigningPrefs,
  `effectiveSignMethod`, `jurisdictionSignRequirement`), the Ask chooser (`ChooseSignRequest` in
  `lib/state/types.ts`), and the Signed pill/filter (`lib/types/sign-tier.ts`). The demo showed that
  a per-action *preference* with a jurisdiction *floor* is both understandable and safer than a
  binary scheme: users can always opt up, jurisdictions can only raise, and the Signed badge makes
  the strength visible after the fact — which is the actual trust product, not scheme uniformity.
- **Affected docs/lines:**
  - `docs/GLOSSARY.md:87` (MUST be signed webauthn-es256)
  - `docs/08-IDENTITY-AND-DEVICE-POLICY.md:44-49, 139, 283-289, 320, 446, 572-574, 604-606`
    ("legacy p256", hard override, "not the production civic path")
  - `docs/entities/partitioning/jurisdiction.md:68` (`signing.defaultScheme`), `:104` (hard-override
    invariant)
  - `docs/entities/civic-content/vote.md:29, 59` · `petition-signature.md:29, 57` · `petition.md:88`
  - `docs/entities/civic-identity/thread-credential.md:13, 60, 80-95` · `civic-identity/future.md:19`
    (retire-p256 note)
  - `docs/10-USER-STORIES.md:194, 208` · `docs/11-USER-FLOWS.md:405, 414-415, 454, 466`
  - `docs/ROADMAP.md:21`
  - Code: `public-record/src/jurisdiction.ts:131-134` (`requiredSignScheme` hard override),
    `jurisdiction-data/*/jurisdiction.ts` (no signing floors yet)

### C2. `appliesToDistrictIds` un-deprecated: region for filtering, district list for display

- **Old assumption (sanity sweep):** `appliesToDistrictIds` is a deprecated alias, superseded by
  `appliesToRegion`; a materialized `entity_audience` projection is "future".
- **Proposed change:** Keep **both**, with distinct jobs: `appliesToRegion` is the canonical
  geographic stake compiled for **affected-geo count filtering**; the district-id list is the
  **server-resolved projection of that region onto stable district slugs**, served on every record
  DTO so the frontend can render district pills, link district pages, drive the Affected filter, and
  resolve `authorGeo` without any geometry. The `entity_audience` projection graduates from future
  to MVP (it *is* the district-id list). Strike "deprecated" language; document the derivation rule
  (region → slugs at `asOf`; refreshed on boundary revision).
- **Web-app policy that forced this, and why:** `FeedItem.districts` / `RecordDetail.districts`
  (district slugs) power the district pills, `DistrictView` per-thread listing, `jurisdictionWidePost`
  drop-off logic, the Affected filter, and the `authorGeo` context
  (`web-app/src/lib/read-model/geography.ts`). A RegionRef alone cannot do any of that client-side —
  the client would need geometry or a per-post resolution round-trip. A slug list is cheap, stable,
  and leaks nothing (the *post's* stake is public by design).
- **Naming (RESOLVED):** canonical names stay **`appliesToRegion` / `appliesToDistrictIds`**;
  "affected" remains UI vocabulary only. The list is **year-less district slugs** (stable seats,
  what the web-app routes on), not revision ids.
- **Affected docs/lines:**
  - `docs/GLOSSARY.md:54-57` (deprecation callout), `:157` (superseded-terms row)
  - `docs/REGION-MODEL.md:29, 67, 73, 126`
  - `docs/entities/partitioning/entity-rules.md:73, 80-81, 110-111` (alias/deprecated wording; add
    the projection attribute)
  - `docs/entities/partitioning/region.md:46, 60` · `district.md:56` · `partitioning/future.md:6`
    (entity_audience moves out of future)
  - `docs/ROADMAP.md:40` · `docs/01-CONTRIBUTOR-SPEC.md:241` (§6.0 District bullet)
  - `web-app/src/lib/api/CONTRACT.md` (Part 1 notes districts already; align naming)

### C3. Least-resistance registration: PII moves to the KYC step

- **Old assumption:** Registration collects name, address, and birthdate
  (`POST /v1/auth/otp/verify` requires `birthdate`; `docs/11-USER-FLOWS.md` §1.1 "Enter code +
  profile (name, address, birthdate, over_18)"); address is geocoded at registration.
- **Proposed change:** Registration = email OTP + **handle + display name** (both required, C4) and
  nothing else. Legal name, address (and whatever the provider needs) are collected at the **KYC
  step** (Didit); geocode syncs when the address first lands (KYC or later profile PATCH). Age gate:
  keep an `over_18` self-attestation checkbox at registration; KYC re-verifies —
  **clarify** if even the checkbox should move to KYC. `auth.profiles` PII columns become
  fully nullable pre-KYC; `birthdate` drops per the existing `[code-over-18]` task.
- **Web-app policy that forced this, and why:** The register modal is the first-run funnel; the demo
  showed the read surface is fully open and the only thing an account *needs* pre-KYC is a public
  identity (handle/display name) and signing keys. Everything else is drop-off risk with zero
  function until verification. (Note: `web-app/src/components/chrome/RegisterForm.tsx:39-53` still
  shows name/address fields — the web-app itself must also be updated; decision explicitly says
  "not yet reflected in the web-app".)
- **Affected docs/lines:**
  - `docs/11-USER-FLOWS.md:163-174` (§1.1 registration flow)
  - `docs/entities/account/profile.md:23-38` (required column table), `:44` (lifecycle), `:97-100`
    (gaps — extend `[code-over-18]` note)
  - `docs/entities/account/user.md:83` (registration event), `docs/entities/account/verification.md`
    (KYC now *collects* name/address, not just reads them)
  - `docs/01-CONTRIBUTOR-SPEC.md` §5 (KYC inputs), `docs/02-PUBLIC-EXPLAINER.md` if it narrates signup
  - Code: `api/src/http/routes/registration.routes.ts:44-51`, `api/src/http/schemas.ts`
    (`profileInputSchema`), `api/src/services/registration.service.ts`, `api/openapi.yaml`
    `/v1/auth/otp/verify`
  - Web-app: `RegisterForm.tsx` (slim to display name / handle / email / over-18)

### C4. Handle + display name required; private profiles 404; visibility enum widened; thread overrides may widen

- **Old assumption:** `users.handle` / `display_name` optional (`user.md:26-27`); visibility enum is
  4 values (`anonymous | my_district | officials | public`); cascade is
  `thread ?? jurisdiction ?? account ?? anonymous` and a thread override **can only narrow, never
  widen** (`docs/09-ACCOUNT-PRIVACY-MODEL.md` §1-2).
- **Proposed change:**
  - `handle` and `display_name` are **NOT NULL** (unique handle), collected at registration. Null no
    longer needs to carry any privacy semantics — which is exactly what 09 §1 wanted.
  - Visibility enum grows to the web-app's set:
    `anonymous | my_officials | all_officials | my_district | my_jurisdiction | id_verified | public`
    (docs' `officials` splits into `my_officials` / `all_officials`; `my_jurisdiction` and
    `id_verified` are new audience rungs).
  - Cascade becomes `thread ?? account ?? anonymous` where the **thread override wins outright in
    either direction** — widening is a deliberate, warned, per-thread act (the compose/reply
    anonymity picker with warning popup). The account value is a default, not a ceiling. The old
    narrow-only rule made an anonymous-by-default user unable to *ever* stand behind one statement
    publicly, which the demo showed is a real and common intent. The **reveal** flow narrows to:
    changing a *past* thread's visibility (platform-reversible vs on-chain-nuclear) rather than
    every widening act.
  - **Profile privacy:** profile view is gated by the *account-level* visibility; an out-of-scope
    viewer (or a lookup of a persona's hidden handle) gets **404**, per 09 §3 — now applied to the
    whole profile surface (`GET /v1/public/profiles/{handle}`), not just handle lookups.
  - **Clarify:** (a) does the per-**jurisdiction** override layer survive? The web-app has no UI for
    it (recommendation: keep it in the schema as an optional middle layer, ship UI later); (b) the
    default for new accounts — docs' floor is `anonymous`, the mock corpus defaults `public`
    (recommendation: registration asks, defaulting to `public`, with the floor staying `anonymous`
    for anything unset).
- **Web-app policy that forced this, and why:** `lib/types/visibility.ts` (7-value enum + picker),
  `lib/read-model/visibility.ts` (`resolveVisibility` — thread wins outright; commit 70c6c65
  "anonymity per-thread instead of narrowing"), `lib/mock/visibility-overrides.ts` (documents a
  deliberate *widening* override as a feature), the per-thread `AnonymityDropdown` moved into the
  post view with a warning popup (commit 523029f), and `AuthorIdentity.seenByOthersAs` (self-view
  hint). The persona machinery (`/persona/<name>` pages, globally-unique persona names) assumes
  identity is per-thread switchable in both directions.
- **Affected docs/lines:**
  - `docs/09-ACCOUNT-PRIVACY-MODEL.md` — §1 enum table (`:21-33`), §2 cascade + narrow-only
    (`:34-58`), §5 pickup plan (`:75-84`); rewrite from "DESIGN TODO" to spec'd-by-demo
  - `docs/entities/account/user.md:26-27` (required), `:101-104` (gaps)
  - `docs/entities/civic-identity/thread-persona.md:7` (reveal framing), `:96-98` (gaps)
  - `docs/06-PRIVACY-REVIEW.md` disclosure matrix (profile surface now 404-gated)
  - `docs/08-IDENTITY-AND-DEVICE-POLICY.md` §persona/compartmentalization cross-refs
  - Code: `public-record/src/schema/postgres.sql.ts:67` (`users` NOT NULL migration)

### C5. Jurisdiction gate matrix locked (creation / participation / signing / official counts)

- **Old assumption:** Act-eligibility and official-count gates were open `<DECISION>` markers
  (`docs/11-USER-FLOWS.md:87-102`); `graduation.createTier` / participation `actTier` are
  target-only gaps (`jurisdiction.md:70-84, 137-138`); count exposure (`counts.minTier`) is the only
  shipped gate and for `ab-ca-gov` is `["identity_verified","residency_verified"]`.
- **Proposed change:** One per-action gate table per jurisdiction (Part 3 shape), four axes per
  action: **may act** (tier set / residency-in-jurisdiction / role), **minimum sign method**,
  **counts officially** (tier set + residency), and (creation only) **who may create**. Locked
  values:

  | Gate | `oursay-global` | `ab-ca-gov` |
  |---|---|---|
  | create post | any registered · any sign | any registered · **passkey (uv)** |
  | create petition | any registered · any sign | **clarify** (flows/web-app say residency-verified; not restated in the locked decision) · passkey |
  | create poll | any registered · any sign | **officials only** · passkey |
  | comment / react | any registered · any sign | any registered · **quick OK** |
  | vote (act) | anyone | passkey + **jurisdiction residency** |
  | sign petition (act) | anyone | passkey · **anyone** (sign now, verify later) |
  | vote official count | **ID-verified**+ | jurisdiction residency |
  | signature official count | **ID-verified**+ | **jurisdiction residency** |

  Two consequences: (a) `ab-ca-gov` `counts.minTier` (exposure gating) must align with the
  official-count definition — signatures/votes officially count at **residency-in-jurisdiction**,
  so `identity_verified` leaves the AB set; (b) "jurisdiction residency" is a **new gate kind**:
  `residency_verified` tier AND geocode point inside the jurisdiction's region — the tier alone no
  longer encodes it. "ID verification only" for Global official counts reads as the tier set
  `{identity_verified, residency_verified}` (set membership — residency implies ID was checked;
  confirm).
- **Web-app policy that forced this, and why:** `lib/compose-eligibility.ts` hardcodes exactly this
  matrix by jurisdiction display-name (and is wrong for AB polls now — it shows "type N/A" instead
  of officials-only); the sign modal (`SignRequest.showResidencyNotice` / `showAffectedNotice`)
  already narrates "acts now, counts officially later" — sign-now-verify-later is demo-proven UX.
  Officials-only creation needs a **role** gate, which aligns with the decentralization north star
  (authority as a role, not a tier).
- **Affected docs/lines:**
  - `docs/11-USER-FLOWS.md:87-102` (resolve `<DECISION>`s with the matrix above)
  - `docs/10-USER-STORIES.md:49-54` (two-gate model — now three: act / sign / official)
  - `docs/entities/partitioning/jurisdiction.md:70-84` (graduation/actTier → real config), `:119`
    (example), `:132-139` (gaps)
  - `docs/PRD.md` §5/§6 gating narrative · `docs/01-CONTRIBUTOR-SPEC.md` §6-7 gate description
  - `docs/entities/account/verification.md:56, 126` (`official_verified` role/tier resolution needed
    for the officials-only gate)
  - Code: `jurisdiction-data/ab-ca-gov/jurisdiction.ts:24-28` (counts.minTier change + gates),
    `jurisdiction-data/oursay-global/jurisdiction.ts`, `public-record/src/governance.ts`,
    `web-app/src/lib/compose-eligibility.ts`
- **Clarifications needed:** AB petition-creation gate; whether official polls are also the only
  path for graduation-created polls (petition→poll graduation presumably still allowed); Global
  official-count tier set membership as above.

### C6. Server sends geo *relationships*, never locations: `authorGeo` on all read DTOs

- **Old assumption:** Public reads are anonymous/unauthenticated; geo filtering exists only on
  `/counts` via coarse `GeoScope`; DTOs carry no author-residence signal of any kind
  (`API-GAPS-AND-ROADMAP.md:132-138` constraints; `REGION-MODEL.md` count-only scoping;
  `[mvp-c4c-my-district]` "inert without auth").
- **Proposed change:** Every served record/comment carries a server-resolved
  **`authorGeo: "home" | "affected" | "jurisdiction" | "none"`** — the author's narrowest spatial
  relation to (viewer, open post): `home` (author in one of the viewer's home districts — resolved
  **only for residency-verified viewers**, the "privileged" case that technically reveals district
  co-residency), `affected` (author resides in the post's affected area), `jurisdiction` (in the
  post's jurisdiction but outside the affected area), `none`. Raw author districts **never leave
  the server**; residency relations attach to whatever identity surface the viewer is allowed
  (persona or profile), so a private author still shows "affected" without their district ever
  being enumerable. Public read endpoints therefore accept an **optional session** and resolve
  per-viewer (documented CDN-cacheability trade-off: cache the anonymous variant only).
  **Clarify:** relation resolved from *current* residence or the action-time snapshot
  (`[mvp-c4-action-snapshots]`)? Recommendation: action-time once snapshots land (Part 2), current
  until then, and say so on the DTO docs.
- **Web-app policy that forced this, and why:** `AuthorGeoRelation` + `authorGeoRelation()`
  (`lib/types/verification.ts:26-42`, `lib/read-model/geography.ts:188-255`) and the API-boundary
  stripping in `lib/api/identity.ts` (DTOs serve `authorGeo`, `districts`/`authorDistricts` are
  deleted). The demo proved the pills (affected / my-jurisdiction / residency-neighbour glyphs) and
  the author-geo filters carry the civic signal users actually want — *standing*, not *address* —
  and that a relation enum is sufficient for all of it. This is the minimal-privilege model:
  centralized now, consensus-ready later, nothing on the wire a hostile server log could turn into
  a district registry.
- **Affected docs/lines:**
  - `docs/API-GAPS-AND-ROADMAP.md:132-138` (constraints — add the relation-DTO carve-out), `:141-148`
    (future UI assumptions)
  - `docs/REGION-MODEL.md` (viewer-context reads; my-district beyond counts)
  - `docs/06-PRIVACY-REVIEW.md` (new disclosure row: geo-relation enum, its k-anonymity analysis —
    especially `home` for privileged viewers)
  - `docs/entities/account/profile-geocode.md` (consumers), `docs/entities/civic-content/*` DTO
    attribute tables (add `authorGeo`, `signTier`, `editCount`)
  - `web-app/src/lib/api/CONTRACT.md` (add as a Part 2 item — it's absent today)

### C7. Personas are a public surface: names, pages, and thread-scoped activity

- **Old assumption:** A thread persona is a pubkey (`thread_keys.pubkey`); nothing defines a
  human-readable persona name, a persona page, or persona-scoped activity
  (`thread-persona.md` attributes).
- **Proposed change:** Each persona gets a deterministic, **globally-unique display name**
  (Adjective+Animal+NN pattern), stored server-side (see Part 2), plus a public read surface:
  persona page = tier pill, thread-scoped support bar, comments/activity/mentions **within that one
  thread only**. Profile-view anonymity patterns apply (out-of-scope identity lookups 404; the
  persona↔user link never leaves the server).
- **Web-app policy that forced this, and why:** `/persona/<name>` routes, `PersonaView`,
  `lib/read-model/persona.ts` + `lib/api/persona.ts` (globally-unique names are
  correctness-critical — components key on displayed handle and the page resolves from the name
  alone). Tapping any anonymous author must land somewhere useful without leaking anything.
- **Affected docs/lines:** `docs/entities/civic-identity/thread-persona.md` (attributes + new
  surface), `docs/08-IDENTITY-AND-DEVICE-POLICY.md` §2-3 (persona display naming),
  `docs/09-ACCOUNT-PRIVACY-MODEL.md` (persona page = the anonymous mirror of a profile).

### C8. Web-app-side mock/data fixes (align mock to backend shapes — first goal)

Not doc conflicts; the mock cheats to fix while wiring:

| # | Cheat today | Align to |
|---|---|---|
| M1 | Jurisdictions keyed by display name (`"Global"`, `"Alberta"`) everywhere (`compose-eligibility.ts`, `JUR_DATA`, `FeedItem.jurisdiction`) | ids (`oursay-global`, `ab-ca-gov`) + `label` for display, labels from `JurisdictionConfig.labels` |
| M2 | `compose-eligibility.ts` hardcoded matrix | derive from a typed gates config (mirror of Part 3 shape) served by the jurisdiction detail endpoint |
| M3 | AB polls "type N/A" | officials-only create (needs `ViewerContext` role) |
| M4 | `RecordOption.v` documented as "official (residency-verified)" | per-jurisdiction official-count definition (C5) + unofficial/official split like the counts API |
| M5 | `RegisterForm` collects name/address | slim per C3 |
| M6 | `scaleSocial` thins counts client-side | real counts from API; keep as demo-only mode |
| M7 | Viewer's own districts hardcoded (`MY_DISTRICTS`) | `GET /v1/me/districts` (self-data is fine to serve) |
| M8 | `signTier` faked per corpus row | projection from envelope (C1) |
| M9 | Persona names computed client-side over the whole corpus | served on DTOs (`AuthorIdentity`), names minted server-side (C7) |

---

## Part 2 — Proposed Postgres changes

Philosophy holds: minimal privileged info; relationships over locations; append-only where it's
civic record; nothing public ever joins persona→user.

### Changed tables

| Table | Change | Why |
|---|---|---|
| `public.users` | `handle TEXT NOT NULL UNIQUE`, `display_name TEXT NOT NULL` (backfill + constraint migration) | C4 |
| `auth.profiles` | drop `birthdate` → `over_18 BOOLEAN NOT NULL DEFAULT false` (existing `[code-over-18]`); name/address columns stay nullable and empty until KYC | C3 |
| `thread_keys` | + `persona_name TEXT UNIQUE` (minted at join, deterministic from Pₜ + retry-on-collision) | C7 |
| `thread_bindings` | + `visibility TEXT NULL` (per-(user,thread) override; private side of the join, never on public rows) | C4 |
| `record_tx` (or read projection) | + `sign_tier SMALLINT NOT NULL DEFAULT 0` derived at verify time from `signScheme` + WebAuthn UV flag | C1 |

### New tables

```sql
-- C4: account-default + optional per-jurisdiction visibility
ALTER TABLE auth.profiles ADD COLUMN visibility TEXT NOT NULL DEFAULT 'anonymous';
CREATE TABLE auth.visibility_overrides (      -- optional layer, kept per 09; no UI yet
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jurisdiction_id TEXT NOT NULL,
  visibility TEXT NOT NULL,
  PRIMARY KEY (user_id, jurisdiction_id)
);

-- [mvp-c10b-membership]: jurisdiction subscriptions (auto oursay-global at registration)
CREATE TABLE auth.jurisdiction_memberships (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jurisdiction_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, jurisdiction_id)
);

-- C1: per-action signing prefs (quick | ask | passkey per SignAction)
CREATE TABLE auth.signing_prefs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs JSONB NOT NULL,                -- { "post.statement": "ask", "vote": "passkey", ... }
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- C2: the district-id projection of a root's affectedRegion (entity_audience, now MVP)
CREATE TABLE entity_audience (
  entity_id TEXT NOT NULL,
  jurisdiction_id TEXT NOT NULL,
  district_slug TEXT NOT NULL,         -- stable seat (year-less); [] rows absent = jurisdiction-wide
  revision_id TEXT NOT NULL,           -- boundary revision in force when projected
  projected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, district_slug)
);

-- C6 + [mvp-c4-action-snapshots]: RELATIONSHIP snapshot at civic submit — flags, never points
CREATE TABLE record_action_geo (
  tx_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  in_affected BOOLEAN NOT NULL,        -- author point ∈ root's affectedRegion at action time
  in_jurisdiction BOOLEAN NOT NULL,    -- author point ∈ jurisdiction at action time
  tier_at_action TEXT NOT NULL,
  district_slug TEXT NULL              -- ONLY populated where policy needs it (official district
);                                     -- breakdowns); default NULL — privileged-view resolution
                                       -- goes through a live geocode join, never this table

-- Mentions (see docs/entities/civic-identity/mention-node.md):
-- Opaque tokens in committed body (`<@` + base59(node_id) + `>`); NEVER store @handle /
-- reserved label / persona / profile display in record_tx.content.
-- One stable node per (thread_id, mentioned_user_id); reserved_label = random + collision retry
-- (NOT derived from user_id). allocateOrGet folds into civic prepare (near sign) so tokens exist
-- before contentCommitment + envelope sign.
CREATE TABLE mention_map (
  node_id UUID PRIMARY KEY,
  thread_id TEXT NOT NULL,             -- root entity id
  mentioned_user_id UUID NOT NULL REFERENCES users(id),
  reserved_label TEXT NOT NULL UNIQUE, -- random mint; collision-retry vs map + persona_name
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (thread_id, mentioned_user_id)
);

-- Profile/persona Mentions tabs: projected at submit from tokens → mention_map (not @handle text)
CREATE TABLE mention_index (
  tx_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,             -- thread the mention appears in
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tx_id, mentioned_user_id)
);

-- Share tallies (once per account per target)
CREATE TABLE share_marks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_key TEXT NOT NULL,             -- record id or comment key
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, share_key)
);
```

Read projections (feed rows with per-kind metrics, `edit_count`, `comment_count`, profile activity)
can be SQL views or maintained projection tables — implementation freedom for the API task; the
contract is the DTO shape in `web-app/src/lib/types/`.

**Not stored anywhere:** user↔district assignment (unchanged), raw viewer geo on DTOs, persona→user
on any public row, signing *capability* (only prefs and per-tx outcome).

---

## Part 3 — JurisdictionConfig gate shape (replaces `<DECISION>`s, extends `counts`)

```ts
type GateActor =
  | "anyone"                      // any registered account
  | { tiers: KycTier[] }          // set membership
  | { residencyIn: "jurisdiction" }  // residency_verified AND point ∈ jurisdiction region
  | { role: "official" };         // authority is a ROLE, not a tier (north star)

interface ActionGate {
  act: GateActor;                 // who may perform the action at all
  signMin: "quick" | "passkey";   // minimum sign method (uv-verified passkey); user pref may exceed
  official?: GateActor;           // who counts in official totals (absent = same as act)
}

interface JurisdictionGates {
  post: ActionGate; petition: ActionGate; poll: ActionGate;      // creation
  comment: ActionGate; reaction: ActionGate;                     // attachments
  vote: ActionGate; petition_signature: ActionGate;              // singletons
}
```

- `oursay-global`: everything `{ act: "anyone", signMin: "quick" }`; `vote`/`petition_signature`
  `official: { tiers: ["identity_verified", "residency_verified"] }`.
- `ab-ca-gov`: `post`/`vote`/`petition_signature` `signMin: "passkey"`; `vote.act = { residencyIn:
  "jurisdiction" }`; `petition_signature.act = "anyone"`, `official = { residencyIn: "jurisdiction" }`;
  `poll.act(create) = { role: "official" }`; `comment`/`reaction` `signMin: "quick"`.
- Supersedes `signing.defaultScheme` and the `requiredSignScheme` hard override; `counts.minTier`
  (exposure) must stay ⊇-consistent with `official` (AB: drop `identity_verified`).

---

## Part 4 — API endpoints needed (→ web-app feature each powers)

Existing routes stay (`/v1/public/{posts,petitions,polls}` lists/detail/counts, area catalog, auth,
civic write). New/changed, in dependency order:

### Public reads (optional session; viewer-dependent fields resolve when present)

| # | Endpoint | Powers |
|---|---|---|
| P1 | `GET /v1/public/feed?jurisdictions[]&types[]&tierMin&signedMin&cursor` | `FeedView` unified list (CONTRACT §1) |
| P2 | `GET /v1/public/records/{id}` (kind-agnostic detail; interlinks `sourcePetitionId`/`sourcePollId`/`resultId`, `attachedPoll`, `editCount`, `signTier`, `affectedDistrictIds`, `authorGeo`, `identity`) | `PostView` detail + collapsibles (CONTRACT §7, §11-13) |
| P3 | `GET /v1/public/records/{id}/comments?depth=3` | `PostView` comment tree (CONTRACT §6) |
| P4 | `GET /v1/public/profiles/{handle}` → 404 out-of-scope | `ProfileView` header + privacy (C4; CONTRACT §2) |
| P5 | `GET /v1/public/profiles/{handle}/{posts\|activity\|mentions}` | Profile tabs (CONTRACT §3-5) |
| P6 | `GET /v1/public/personas/{name}` | `PersonaView` (C7) |
| P7 | `GET /v1/public/jurisdictions/{id}` (leader, rules copy, labels, **gates**, districtLabel) | `JurisdictionView` + compose eligibility + sign floors (CONTRACT §8) |
| P8 | `GET /v1/public/jurisdictions/{id}/districts/{slug}` | `DistrictView` (CONTRACT §9) |
| P9 | counts endpoints: add `?official=true` (jurisdiction's official gate applied server-side) | official vs live tallies on detail + Result panels |

### Authenticated viewer surface (`/v1/me`)

| # | Endpoint | Powers |
|---|---|---|
| A1 | `GET/PUT /v1/me/jurisdictions` | jurisdiction selector subscriptions (cookie → server) |
| A2 | `GET/PATCH /v1/me/signing-prefs` | Signing Options UI (per-action Quick/Ask/Passkey) |
| A3 | `GET/PATCH /v1/me/visibility` · `PUT /v1/me/threads/{id}/visibility` | profile-privacy picker + per-thread anonymity dropdown |
| A4 | `GET /v1/me/districts` | My Districts filter, interlock logic (self-data only) |
| A5 | `GET /v1/me/record-state?ids=…` (`_my`, `_vote`, signed, shared per id) | reaction/vote highlighting on cards + detail |
| A6 | `POST /v1/me/shares/{shareKey}` | share tally (once per account) |
| A7 | `PATCH /v1/profile` (handle/display rules; address lands → geocode sync) | settings + KYC address capture (`[mvp-c10c]`) |
| A8 | `POST /v1/kyc/didit/session` + webhook | Get Verified flow (Didit, `[code-didit-provider]`) |

### Civic writes (existing `join → prepare → submit`, amended)

| # | Change | Powers |
|---|---|---|
| W1 | `prepare`/`submit` accept `p256` quick-sign wherever `gates[action].signMin === "quick"`; enforce per-action gates (act / signMin / role / residencyIn) fail-closed | Quick Sign path, Ask chooser, AB passkey mandates (C1/C5) |
| W2 | submit writes `record_action_geo` + `sign_tier` | authorGeo-at-action-time, Signed pill (C6, `[mvp-c4]`) |
| W3 | root create accepts `affectedRegion` (+ server projects `entity_audience`) and optional thread visibility | compose geo stake + per-thread anonymity |

---

## Part 5 — Clarifications queue — **ALL RESOLVED 2026-07-04**

1. **Naming** — **keep `appliesToRegion` / `appliesToDistrictIds`** as canonical doc/code names;
   "affected" stays UI vocabulary. (C2)
2. **AB petition creation gate** — **residency-verified (keep)**, passkey sign floor. (C5)
3. **`over_18`** — **self-attest checkbox at registration**; KYC re-verifies; `birthdate` still
   drops. (C3)
4. **Default account visibility** — **`anonymous`**. (C4)
5. **Per-jurisdiction visibility layer** — **kept as documented future optional middle layer**;
   MVP cascade is `thread ?? account ?? anonymous`. (C4)
6. **`authorGeo` timing** — **action-time is the target** (via `[mvp-c4-action-snapshots]`);
   current residence is the documented interim. (C6)
7. **Official representation** — **role, not tier** (platform-assigned, revocable; tiers stay pure
   KYC facts). (C5)
8. **Global official counts** — **tier set `{identity_verified, residency_verified}`**
   ("ID-or-better"). (C5)

---

## Part 6 — Post-review clarifications (2026-07-04, user review of the W1 sweep — **applied to docs**)

Binding corrections from the user's review; W2–W5 agents treat these as locked:

1. **"Post" has two scopes** — FE "post" = any root record (statement/petition/poll/result);
   backend `post` = statement only; write "statement post" in mixed contexts, explain once per doc.
   Gates apply to **all four root types**, `result` included (automated, attributed to the poll's
   author via graduation or direct post).
2. **Official count = counting floor, never a participation barrier** — anyone the act gate admits
   participates; below-floor actions bunch into unverified counts until the author verifies. Gate
   field renamed **`officialCount`** (suffix discipline: official *role* / official *count* /
   official *verification*); its floor is always the act gate.
3. **AB: official-role holders cannot vote or sign petitions** — `deny: [{role:"official"}]` on
   `vote` (act-blocked) and `petition_signature` (count-excluded with reason tag `official_role`).
4. **Changeable by default** — platform defaults `allowChange`/`allowRevoke` = **true**
   (intentionally loose); jurisdictions tighten to final via config (AB: final). Never a platform
   default of final.
5. **Official role acquisition** — manual platform validation; identity_verified min, residency
   preferred; in-district filter logic forced to the **represented** district (home address may be
   out-of-district); identity_verified + role = composite **official verification**.
6. **Official-count record** — platform-authored record type on the public record: signed snapshot
   of all eligible signatures/votes + per-participant status (`id_verified`,
   `residency_verified[none|jurisdiction|affected]`, `official_role[not eligible in AB]`),
   amendable with per-entry reason tags; auditable against personas, not profiles
   (docs/entities/record/future.md).
7. **Visibility ships with 4 values only** — `anonymous | officials | my_district | public`
   (web-app wire value `all_officials`, label "Officials"). `officials` = **officials affected by
   the post** (affected-district officials + jurisdiction-level official-role holders, e.g. the
   premier). `my_officials`/`my_jurisdiction`/`id_verified`/`affected` = future MAY. Platform is in
   a privileged position (knows every author) and shares only per the author's setting.
8. **Registration fields** — handle **required**; display name optional (falls back to handle);
   full name + address **optional at signup** behind a helper (fill before ID/residency
   verification; no address ⇒ no auto jurisdiction recommendation — V1 feature, 5+ jurisdictions);
   over_18 checkbox required. No/pseudo location never blocks (verified: geocode is best-effort in
   `registration.service.ts`).
9. **Graduation** — forced poll at threshold (official agreement not required); AB officials may
   promote early at any point; proposer stays poll author; petition unaffected — **deadline is the
   only closing**. Threshold = fixed n or % of jurisdiction's verified users (moving or frozen at
   create), platform-set from jurisdiction config, never author-set; AB plan: % moving target →
   fixed (10% of previous provincial election valid votes) later.
10. **`riding_slug`/`ridingSlug` must not exist** — coder error from the "riding" UI label; only
    GLOSSARY may name it as a legacy term (superseded table, not a heading).
11. **Deferred at-action shortcut** — verification tier may be included in the record (exposes
    affected-or-not only; never district); powers `Timeframe → current | at posting` filter
    (both = future). Not MVP (docs/entities/record/future.md).
12. **Web-app intentional gaps** (do not "fix" silently; schedule in W2):
    - compose is missing "Affects Specific District(s) (optional)" — intentional for the demo;
    - historical district navigation + historic district pages are missing;
    - district routes must nest under the jurisdiction: `district/edmonton-strathcona/` →
      `alberta/district/edmonton-strathcona/` (cross-jurisdiction name collisions).
13. **DTO audience fields live on roots only** — children (comments/reactions/votes/signatures)
    infer `appliesToRegion`/`appliesToDistrictIds` from the parent/root, never carry them
    (entity-projection.md).
14. **`.agents/` is untracked** — tracked docs reference it only inside HTML comments
    (`<!-- see .agents/... -->`), tags stay visible.

---

_Action plan + agent prompts: [`WEB-APP-ALIGNMENT-PROMPTS.md`](./WEB-APP-ALIGNMENT-PROMPTS.md)._

---

## Changelog

- **Docs swept 2026-07-04** (`[align-w1-docs]` complete): C1–C7 applied across 33 files in `docs/`
  with the Part 5 answers baked in. Soft keys un-deprecated (per-action prefs + per-gate floors,
  hard-override language removed); `appliesToDistrictIds` kept as the region's district-slug
  projection (`entity_audience` promoted to MVP); least-resistance registration (handle/display
  required, over_18 checkbox, PII at KYC); 09-ACCOUNT-PRIVACY-MODEL rewritten (7-value enum,
  `thread ?? account ?? anonymous`, widen-or-narrow thread override, profile 404s, anonymous
  default); `<DECISION>` gate matrices resolved (incl. AB officials-only polls, jurisdiction
  residency, sign-now-verify-later, Global ID-or-better official counts); `authorGeo` relation
  DTOs documented (REGION-MODEL, 06 disclosure rows, entity read tables); persona display names +
  persona pages specced in thread-persona.md. Code encoding is `[align-w3-gates-schema]` /
  `[align-w4-api-surface]`.
- **Post-review corrections applied 2026-07-04** (Part 6): officialCount rename + floor framing,
  AB official-role deny on vote/sign, changeable-by-default finality, 4-value shipped visibility
  with officials-affected-by-post semantics, registration field split (handle required, rest
  optional + helper), graduation forced/manual + deadline-only closing + threshold shapes,
  official-count record + deferred tier-in-record, root-only audience DTO fields, .agents refs
  moved into HTML comments, riding_slug references purged outside the GLOSSARY legacy row.
- **Bridge MVP code landed 2026-07-05/06** (Phases 1–6 of the alignment plan): W2 mock/DTO alignment,
  W3 gates config + idempotent schema + fail-closed write enforcement (table-driven gate matrix,
  `20-gates.spec.ts`), W4 public + `/v1/me` API surface (P1–P9, A1–A7), W5 web-app wired to the live
  API through the Next `/v1/*` proxy (mock path kept behind `NEXT_PUBLIC_MOCK_ONLY`), the dev DB seed
  (`npm run seed -w @oursay/api`), and the Didit KYC provider (+ Postmark OTP). Phase 6 adds the e2e
  smoke `api/test/35-e2e-smoke.spec.ts` — one ordered journey over the live HTTP surface (register →
  dev-attest identity → subscribe AB → passkey statement → quick-sign comment → vote act-blocked
  pre-residency → address + platform residency attest → passkey vote lands → persona page → private
  profile 404 → seeded feed) against the real 2019 Alberta boundaries. `npm test -w @oursay/api` =
  206 passing / 3 pending (the 3 = live Didit specs, skipped without sandbox creds / cached artifact).
- **Deferred (2026-07-06) — Didit hosted UI wiring (gap A):** the Didit backend is complete and proven
  against the sandbox (`POST /v1/kyc/didit/session`, throttled poll, HMAC webhook, idempotent award),
  but `web-app/src/lib/api/me.ts` still only calls dev-attest + platform residency — it never opens a
  Didit hosted session. Under `KYC_PROVIDER=didit` the dev "Get Verified" button 403s (gap B: didit
  declines direct `verify()`). Dev default stays dev-attest; the web-app end-to-end walk uses
  `KYC_PROVIDER=stub`. Tracked in ROADMAP.md and API-GAPS-AND-ROADMAP.md.
- **Mention nodes proposed 2026-07-11** (Slice 1 docs + schema): Part 2 `mention_index` corrected — no longer “resolved from `@handle` in content.” Added `mention_map` (stable opaque node per `(thread_id, mentioned_user_id)`, random reserved labels). Committed body stays a string with `<@base59(nodeId)>` tokens; allocate on prepare near sign; read resolve reuses author-card visibility (reserved | persona | profile). Entity spec: [`entities/civic-identity/mention-node.md`](../entities/civic-identity/mention-node.md). Official always-public mention special-case deferred to V1 (`civic-identity/future.md`). DDL landed in `public-record` postgres schema; allocate/resolve/compose wiring = later slices.
