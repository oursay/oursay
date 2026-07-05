# Mock corpus — wireframe DATA block port

This folder is a faithful, typed port of the sample data embedded in
[`wireframes/mobile/oursay-mobile.svg`](../../../../wireframes/mobile/oursay-mobile.svg)
(the `DATA` block, roughly lines 1557–1888). It is the read-model contract the
UI renders against today; every field maps to a real OurSay entity (see
[`docs/entities/`](../../../../docs/entities/README.md)) or is flagged UI-only.

The single deterministic clock is `NOW = 2026-06-30T09:41:00` (`constants.ts`),
matching the wireframe so `relTime()` resolves identically in tests and render.

## Files

| File | Wireframe source | Exports |
|------|------------------|---------|
| `constants.ts` | `NOW`, `MY_NAME`, `MY_DISTRICTS` | Deterministic clock + example viewer identity |
| `jurisdictions.ts` | `JUR_DATA`, `DISTRICT_NAMES` | `JUR_DATA`, `DISTRICT_NAMES`, `districtName()` |
| `posts.ts` | `POSTS[]` (16 rows) | `POSTS` |
| `districts.ts` | `DISTRICT` | `DISTRICT` |
| `profile.ts` | `PROFILE` | `PROFILE` |
| `details.ts` | `POST_STATEMENT/PETITION/POLL/RESULT`, `COMMENTS_*`, `POST_TYPES`, `RIVER_PATH_QUESTION` | detail samples + `POST_TYPES` |

## Field → entity mapping

| Wireframe field | Ported as | Real entity attribute | Notes |
|-----------------|-----------|-----------------------|-------|
| `POSTS[].type` | `FeedItem.kind` | record type (`post`/`petition`/`poll`/`result`) | `statement` → canonical `post` via `toCanonical()` |
| `POSTS[].jur` | `FeedItem.jurisdiction` | `JurisdictionConfig` name | |
| `POSTS[].tier` (0–3) | `FeedItem.tier` | author KYC tier / Official role | 0 None · 1 Identity · 2 Residency · 3 Official |
| `POSTS[].districts[]` | `FeedItem.districts` | `appliesToRegion` (district refs) | `[]` jurisdiction-wide · `[slug]` one riding · `[slug,…]` several |
| — (people registry) | `FeedItem.authorDistricts` / `CommentNode.districts` | author residence districts | **Server-internal**: stamped from `personDistricts()`, used by read-model filters, stripped by the API — served DTOs carry the `authorGeo` relation instead |
| `up` / `down` | `FeedItem.up` / `.down` | `reaction` aggregate (✓/✗) | Social counts; thinned by `scaleSocial` |
| `sig` / `goal` | `FeedItem.sig` / `.goal` | `petition_signature` aggregate | Civic count; never thinned |
| `options[].v` | `FeedItem.options[].v` | poll `vote` aggregate | Civic count; never thinned |
| `comments` | `FeedItem.comments` | `comment` count | Social count |
| `edits` | `FeedItem.edits` | content/comment revision count | Drives "N edits" affordance |
| `attachedPoll` | `FeedItem.attachedPoll` / `RecordDetail.attachedPoll` | petition→poll graduation (spec §8.6) | Wei Chen petition only |
| `ts` (ISO) | `RecordDetail.ts` / `CommentNode.ts` | content record `createdAt` | **UI-only for ordering**: display via `relTime()`, not the sort key |
| `_my` | `RecordDetail._my` / `CommentNode._my` | viewer's own `reaction` | Exclusive per author per target |
| `_vote` | `RecordDetail._vote` | viewer's own `vote` | |
| `sourcePetition` / `sourcePoll` / `resultPublished` | `RecordDetail.*` | poll↔petition / result↔poll,petition linkage | Drive interlink collapsibles |
| `JUR_DATA` | `JurisdictionSummary` | `JurisdictionConfig` | leader = name only; role inferred |
| `DISTRICT` | `DistrictDetail` | District | Representative riding; prod loads by slug |
| `PROFILE` | `PublicProfile` | public profile | leader → profile link has no first-class entity yet |
| `PROFILE.activity[]` | `ActivityItem[]` | derived action feed | **Gap**: no API surface (see CONTRACT.md) |
| `PROFILE.mentions[]` | `MentionItem[]` | derived mention feed | **Gap**: no API surface (see CONTRACT.md) |
| `activity[].icon` | `ActivityItem.icon` | — | **UI-only** glyph override |

### UI-only fields (no entity attribute)

- `ts` as an **ordering** source — display only; the record's true ordering is
  server-side. `relTime()` uses it purely to render `Nm/Nh/Nd ago` or an
  absolute date.
- `activity[].icon` — a glyph id override for the Activity row.
- Synthetic `id` — see below; the wireframe navigates to representative samples,
  not by real record id.

## Synthetic id lookup (handle/title → id)

The wireframe `POSTS[]` rows carry **no id** (navigation is representative-target,
not id-based). This port assigns a stable synthetic `id` to every row and detail
sample so `getRecordDetail(id, kind)` can resolve one. Ids are shared where the
same record appears in both the feed corpus and a detail sample.

| id | kind | author (handle) | title |
|----|------|-----------------|-------|
| `stmt-dana-transit` | statement | Dana Whitecloud (`dwhitecloud`) | Transit funding should be a national priority |
| `poll-oursay-rcv` | poll | OurSay Stewards (`oursay`) | Should OurSay add ranked-choice polls? |
| `pet-priya-oss` | petition | Priya Anand (`priya`) | Open-source the public election software |
| `stmt-marcus-votingage` | statement | Marcus Lee (`mlee`) | Lower the voting age to 16 |
| `res-oursay-name` | result | OurSay Stewards (`oursay`) | Result: Platform name vote |
| `stmt-rae-ravine` | statement | Rae Nguyen (`raenguyen`) | Constituency update: Whitemud ravine review |
| `stmt-premier-budget` | statement | Hon. A. Premier (`premier`) | Budget 2027 consultation now open |
| `poll-ableg-budget` | poll | Alberta Assembly (`ableg`) | Provincial budget priority for 2027 |
| `res-ableg-bill12` | result | Alberta Assembly (`ableg`) | Result: Bill 12 community poll |
| `stmt-jordan-bikelanes` | statement | Jordan Vance (`jvance`) | More bike lanes on Whyte Avenue |
| `stmt-priti-rink` | statement | Priti Shah (`pshah`) | Save the Elbow Park outdoor rink |
| `stmt-hana-ravine` | statement | Hana Okafor (`hanao`) | Protect the Whitemud Creek ravine — **also `POST_STATEMENT` detail** |
| `pet-sam-109st` | petition | Sam Driver (`samd`) | Repave 109 Street before winter |
| `pet-rosa-greenline` | petition | Rosa Klein (`rosak`) | Fund the Green Line LRT extension |
| `pet-wei-path` | petition | Wei Chen (`weichen`) | Twin the river-valley commuter path — **also `POST_PETITION` detail** |
| `stmt-dale-snow` | statement | Dale Friesen (`dfriesen`) | Coordinate snow clearing across Calgary core |

Detail-only samples (graduation chain continuation, not in `POSTS[]`):

| id | kind | title |
|----|------|-------|
| `poll-river-path` | poll | Twin the river-valley path — fund it in 2027? (`POST_POLL`) |
| `res-river-path` | result | Result: River-valley path twinning vote (`POST_RESULT`) |

Profile-authored samples carry `prof-`-prefixed ids
(`prof-rae-ravine`, `prof-rae-footbridge`, `prof-rae-priority`, `prof-rae-townhall`).

`getRecordDetail(id, kind)` resolves ids that match a `POST_TYPES` sample; other
feed ids fall back to the representative sample for their kind (mirroring the
wireframe's representative-target navigation).
