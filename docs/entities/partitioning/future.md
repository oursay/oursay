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
The per-action **`gates`** map (act / signMin / platformCount — including the jurisdiction-residency, official-role, and **media-accredited** gate kinds), **`recognizedAccreditationBodyIds`**, and the `graduation` promotion policy are now **target-specced in [jurisdiction.md](./jurisdiction.md)** with the locked launch matrices for `oursay-global` and `ab-ca-gov`; they absorb the earlier `createTier`/`actTier` sketches. Not yet in code. Media powers are credential-mediated ([../account/media-accreditation.md](../account/media-accreditation.md)) — not a per-jurisdiction gallery role.
→ `[align-w3-gates-schema]`, `[v1-media-accreditation-bodies]`, `[v1-media-accreditations]`. <!-- see .agents/WEB-APP-ALIGNMENT-PROMPTS.md -->

## Poll count exposure & Media exclusivity window

Per-poll **exposure mode** (when jurisdiction `counts` allow vote/signature scalars at all): **`live`** | **`delayed`** | **`blind_until_close`**. **Live** publishes block-settled tallies as they accumulate; **delayed** publishes only up to `now − delay`; **blind_until_close** withholds running totals (and optionally option breakdowns) from general public surfaces until the poll closes, while the ledger still accumulates votes.

**Future (deferred):** optional **Media exclusivity window** after close — e.g. aggregate results withheld from the general public for **N business days** while **media-accredited** poll hosts or recognized media desks may access early; exact **N**, eligibility rules, and UX are not locked (planning discussions have used ~2 business days as an example). No API or config shape is specified here.

## Multi-jurisdiction regions
A region is, in theory, multi-jurisdiction-capable; discussions remain jurisdiction-scoped for now. The cross-jurisdiction region path is future. Related: API container still uses a single deployment-default chain for some write paths ([mvp-c10-multi-jurisdiction]); user ↔ jurisdiction membership ([mvp-c10b-membership]).

## Region presets + history filters
- Platform-created custom region presets via service/API ([mvp-c5-region-presets]).
- `scope=my-district` with authenticated counts context ([mvp-c4c-my-district]).
- History-based "ever in region" filter mode ([mvp-c11-ever-in-region]).

## Platform-signed boundary revisions
District redraws published as platform-signed records (see [record/future.md](../record/future.md)).
