# Record — future / deferred

Deferred design intent for the `record/` entities (record-transaction, public-record, entity-projection). Not shipped.

## Platform-signed records
A class of records authored by the **platform key** rather than a participant persona. Dual-sign ceremony (shipped framework):

1. An **admin** attests a clear domain-separated request (`oursay/v1/platform-ops-request`) with an auth passkey (HTTP) or enrolled ops soft-key (CLI).
2. The **platform** builds a `platform_ops` `TxEnvelope`, embeds the admin attestation in private content, and signs the envelope (`authorPubkey` = platform P-256 pubkey).
3. Submit verifies admin role on the key holder + matching prepare memory (HTTP) + platform signature, then appends to the jurisdiction chain (outbox) and applies the mutable projection.

First shipped kinds: `official_seat_claim` / `official_seat_revoke` (`POST /v1/platform-ops/prepare|submit`, `admin:seat` CLI).

Still deferred as kinds on the same framework:
- Final tallies and **tally amendments** (corrections to a published count).
- **Censorship reasoning** (why a record was redacted/removed) — wire after redaction HTTP lands.
- **District boundary revisions** (a redraw published as a signed record; prefer artifact digests over embedding full geometry).
- **Official profiles** (MLA / premier / agency), distinct from participant accounts.
- **Post Archiving** when the platform has been required to archive the post/statement to comply with lawful requests.
- **Jurisdiction policy ingest** (gates, recognition lists, labels, limits) — see [partitioning/future.md](../partitioning/future.md).

## Signed count snapshots
Platform-signed count manifests with deadline snapshots for poll/signature platform counts ([mvp-c13-signed-count-snapshots], R26).

## Platform-count record
The concrete shape of the platform count: a **platform-authored record type appended to the public record**. The platform vows to include exactly the participants the jurisdiction's rules advertise, and signs a snapshot of **all eligible signatures/votes with each participant's status**: `id_verified`, `residency_verified[ none | jurisdiction | affected ]`, `official_role` (excluded from platform count for AB petition signatures when the signer holds the role). The record can be **amended** as needed with an additional **reason tag per signature/vote** (e.g. `official_role` exclusion, revocation, tier change). Anyone can validate their own participation and what the record shows they said — on platform, or via an independent auditor who checks against **personas, never profiles**.

## Verification tier in the record (deferred "at action time" option)
A discussed-but-deferred quick path to "at action time" semantics before full snapshots: include the author's **verification tier** in the record at write time. This exposes only *affected-or-not* — it adds **no jurisdiction or district data** to the record (a user's district must **never** appear in the public record; verification tier is acceptable). It cannot power a "my district" filter at-action (that needs historic geo verification data later), but it makes "at time of action" and "now" views work; it can also mark "was an official-role holder at action time" for users who since lost the role. UI sketch: a refinement filter `Timeframe → current | at posting | both (inclusive)` — "both" is hard, future-only. Not enough for arbitrary "status at time T" search. **Not MVP; still deferred — recorded here so the option isn't lost.**

## Formal Result publish
A derived `result` record published at poll close, with geographic + tier breakdown and an anchor reference ([mvp-c12-poll-results]).

## Action-time snapshots
Snapshot geographic **relationship flags** (in-affected / in-jurisdiction — never points) and verification tier **at action time** on each civic write, so historical counts reproduce regardless of later address/tier changes ([mvp-c4-action-snapshots], [mvp-c4b-date-filters]). Also the target source for the per-author `authorGeo` relation on read DTOs (current residence is the documented interim — [REGION-MODEL.md](../../REGION-MODEL.md)).

## External anchoring cadence
Production anchoring cadence and deploy-hash publication ([DEPLOYMENTS.md](../../../DEPLOYMENTS.md)) — launch blocker per PRD open questions.
