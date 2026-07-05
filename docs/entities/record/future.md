# Record — future / deferred

Deferred design intent for the `record/` entities (record-transaction, public-record, entity-projection). Not shipped.

## Platform-signed records
A class of records authored by the **platform key** rather than a participant persona:
- Final tallies and **tally amendments** (corrections to a published count).
- **Censorship reasoning** (why a record was redacted/removed).
- **District boundary revisions** (a redraw published as a signed record).
- **Official profiles** (MLA / premier / agency), distinct from participant accounts.
- **Post Archiving** when the platform has been required to archive the post/statement to comply with lawful requests.

## Signed count snapshots
Platform-signed count manifests with deadline snapshots for official poll/signature counts ([mvp-c13-signed-count-snapshots], R26).

## Official-count record
The concrete shape of the official count: a **platform-authored record type appended to the public record**. The platform vows to include exactly the participants the jurisdiction's rules advertise, and signs a snapshot of **all eligible signatures/votes with each participant's status**: `id_verified`, `residency_verified[ none | jurisdiction | affected ]`, `official_role` (not count-eligible in `ab-ca-gov`). The record can be **amended** as needed with an additional **reason tag per signature/vote** (e.g. `official_role` exclusion, revocation, tier change). Anyone can validate their own participation and what the record shows they said — on platform, or via an independent auditor who checks against **personas, never profiles**.

## Verification tier in the record (deferred "at action time" option)
A discussed-but-deferred quick path to "at action time" semantics before full snapshots: include the author's **verification tier** in the record at write time. This exposes only *affected-or-not* — it adds **no jurisdiction or district data** to the record (a user's district must **never** appear in the public record; verification tier is acceptable). It cannot power a "my district" filter at-action (that needs historic geo verification data later), but it makes "at time of action" and "now" views work; it can also mark "was an official-role holder at action time" for users who since lost the role. UI sketch: a refinement filter `Timeframe → current | at posting | both (inclusive)` — "both" is hard, future-only. Not enough for arbitrary "status at time T" search. **Not MVP; still deferred — recorded here so the option isn't lost.**

## Formal Result publish
A derived `result` record published at poll close, with geographic + tier breakdown and an anchor reference ([mvp-c12-poll-results]).

## Action-time snapshots
Snapshot geographic **relationship flags** (in-affected / in-jurisdiction — never points) and verification tier **at action time** on each civic write, so historical counts reproduce regardless of later address/tier changes ([mvp-c4-action-snapshots], [mvp-c4b-date-filters]). Also the target source for the per-author `authorGeo` relation on read DTOs (current residence is the documented interim — [REGION-MODEL.md](../../REGION-MODEL.md)).

## External anchoring cadence
Production anchoring cadence and deploy-hash publication ([DEPLOYMENTS.md](../../../DEPLOYMENTS.md)) — launch blocker per PRD open questions.
