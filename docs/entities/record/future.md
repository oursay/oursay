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

## Formal Result publish
A derived `result` record published at poll close, with geographic + tier breakdown and an anchor reference ([mvp-c12-poll-results]).

## Action-time snapshots
Snapshot geographic area and verification tier **at action time** on each civic write, so historical counts reproduce regardless of later address/tier changes ([mvp-c4-action-snapshots], [mvp-c4b-date-filters]).

## External anchoring cadence
Production anchoring cadence and deploy-hash publication ([DEPLOYMENTS.md](../../../DEPLOYMENTS.md)) — launch blocker per PRD open questions.
