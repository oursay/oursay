# Civic content — future / deferred

Deferred design intent for the `civic-content/` entities (post, petition, poll, vote, petition-signature, result, comment, reaction). Not shipped.

## Broader Result types
[result.md](./result.md) is scoped narrowly to **poll close + near-term publish**. Broader outcomes are future:
- **Petition outcomes** (delivered / responded as a published result).
- **Bill / legislative outcomes** tied to a thread.
- **Official responses** from an addressed recipient.

A formal derived `result` record published at poll close is the primary near-term gap ([mvp-c12-poll-results]); the broader types above come after.

## Post field model
Target `PostContent`: `title` **required** (≤200), `body` **optional** (≤2000), enforced via `JurisdictionConfig.contentLimits`. Today the shape is inverted (`title?`, `body` required, no caps).
→ `.agents/CODE-ALIGNMENT-PROMPTS.md` `[code-post-content-fields]`.

## Petition addressedTo automation
Recipient inference (district → MLA(s); jurisdiction-wide → Legislative Assembly; constitutional checkbox → Minister / Lieutenant Governor) with platform/moderation override; delivery + response workflow automation.

## allowChange / allowRevoke unification
Unify the two governance flags into a single `allowChange` field covering both vote change and signature revoke. See [partitioning/future.md](../partitioning/future.md).

## On-record "intent" transactions
When a change/revoke is rejected by the platform (e.g. after deadline), optionally record the *attempt* on-record for transparency toward officials. Discussion only.

## Social tagging
Future `#`/`@` links inside content bodies are a UI concern; the record layer stores plain text.

## Custom reactions
Reaction kinds beyond `✓`/`✗` (custom emoji) — future extension (R1).
