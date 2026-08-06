# Partitioning — future / deferred

Deferred design intent for the `partitioning/` entities (jurisdiction, district, region, entity-rules). Not shipped.

## Thread audience model
Remaining `EntityRules` audience axis (`appliesToDistrictIds` is **kept** — the served district-slug projection of the region, see [entity-rules.md](./entity-rules.md)):
- **`appliesToRegion`** — *shipped*: a `RegionRef` — `jurisdiction` / `district:<district_slug>` (stable seat) / `revision:<revisionId>` (pinned version) / `region:<presetId>` / `{op:and|or|not, refs}` unions.
- **`appliesToVerified`** — minimum KYC tier **set** counting toward stake/platform totals.
→ `[code-applies-to-verified]`. <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->

> The **`entity_audience`** materialized projection is no longer future — it is the MVP mechanism
> maintaining `appliesToDistrictIds` (specced in [entity-rules.md](./entity-rules.md) and
> [district.md](./district.md); built in `[align-w3-gates-schema]`).

## JurisdictionConfig labels + contentLimits
Add per-jurisdiction **`labels`** (post/petition/poll/result/district user-facing labels) and **`contentLimits`** (hard caps per type). Today `JurisdictionConfig` has neither.
→ `[code-jurisdiction-labels-limits]`. <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->

## Per-action gates + graduation config
The per-action **`gates`** map (act / signMin / platformCount — including the jurisdiction-residency, official-role, and **media-accredited** gate kinds) and the `graduation` promotion policy are now **target-specced in [jurisdiction.md](./jurisdiction.md)** with the locked launch matrices for `oursay-global` and `ab-ca-gov`; they absorb the earlier `createTier`/`actTier` sketches. **`recognizedAccreditationBodyIds`** is on `JurisdictionConfig` (empty lists until catalog bodies are chosen). Media-accredited **gate actor** evaluation and Media accreditation rows are still open. Media powers are credential-mediated ([../account/media-accreditation.md](../account/media-accreditation.md)) — not a per-jurisdiction gallery role.
→ `[align-w3-gates-schema]` (Media actor), `[v1-media-accreditations]`. <!-- see .agents/WEB-APP-ALIGNMENT-PROMPTS.md -->

## Poll count exposure & Media exclusivity window

Per-poll **exposure mode** (when jurisdiction `counts` allow vote/signature scalars at all): **`live`** | **`delayed`** | **`blind_until_close`**. **Live** publishes block-settled tallies as they accumulate; **delayed** publishes only up to `now − delay`; **blind_until_close** withholds running totals (and optionally option breakdowns) from general public surfaces until the poll closes, while the ledger still accumulates votes.

**Future (deferred):** optional **Media exclusivity window** after close — e.g. aggregate results withheld from the general public for **N business days** while **media-accredited** poll hosts or recognized media desks may access early; exact **N**, eligibility rules, and UX are not locked (planning discussions have used ~2 business days as an example). No API or config shape is specified here. Longer-term, Media / Official / `admin` analytics and results access are expected to live in a **unified portal** (see [../account/admin.md](../account/admin.md)).

## Multi-jurisdiction regions
A region is, in theory, multi-jurisdiction-capable; discussions remain jurisdiction-scoped for now. The cross-jurisdiction region path is future. Related: API container still uses a single deployment-default chain for some write paths ([mvp-c10-multi-jurisdiction]); user ↔ jurisdiction membership ([mvp-c10b-membership]).

## Region presets + history filters
- Platform-created custom region presets via service/API ([mvp-c5-region-presets]).
- `scope=my-district` with authenticated counts context ([mvp-c4c-my-district]).
- History-based "ever in region" filter mode ([mvp-c11-ever-in-region]).

## Platform-signed boundary revisions
District redraws published as platform-signed records (see [record/future.md](../record/future.md)).

## Platform-signed jurisdiction policy

Standing jurisdiction configuration is authored today as TypeScript in `@oursay/jurisdiction-data` and registered in-process at API startup (`registerJurisdiction`). That is an **interim deploy-time** source of truth.

**Partial ship:** the `platform_ops` record framework (admin clear-request attestation + platform-signed envelope) is live. **Official seat assign/revoke** is the first kind on that path (`admin:seat`, `POST /v1/platform-ops/*`).

**Still deferred on the same framework:** standing config should eventually be **admin-ingested into the database** and mutated by appending platform-ops attestations to the jurisdiction’s chain — the same transparency / audit posture the public record uses for civic actions. Policy changes must leave an append-only, independently verifiable trail.

Remaining actions in this audit class (non-exhaustive):

- Changing gates, labels, content limits, count exposure, graduation, and **`recognizedAccreditationBodyIds`**
- Record redaction / censorship reasoning
- District boundary ingestion and modification (shapefile ingest remains DB-only until wired; content should commit an artifact digest + metadata, not full geometry)
- Other platform sign-offs that alter jurisdiction policy or roster state

See also [record/future.md](../record/future.md) (**Platform-signed records**). Until config ingest lands, recognition lists and other policy fields remain on `JurisdictionConfig` in the data package.
