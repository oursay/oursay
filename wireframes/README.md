# OurSay Wireframes

A **single, functional** mobile wireframe — [`mobile/oursay-mobile.svg`](mobile/oursay-mobile.svg).
It is one standalone SVG with an embedded script: open it in a browser and drive every screen with
the keyboard and mouse. It doubles as a clickable prototype and as the **build spec** for the real
app — a coder can implement OurSay mobile by tracing the well-commented logic inside it alongside
this guide.

> Context: OurSay has no product UI yet (Phase D). This wireframe explores the mobile shell on top of
> the journeys in [`../docs/11-USER-FLOWS.md`](../docs/11-USER-FLOWS.md).

> **Why it looks the way it does:** this README is the *how it works / how to build it* guide.
> The plain-language **design choices and their justifications** live in
> [`DESIGN-DECISIONS.md`](DESIGN-DECISIONS.md) — read that before changing a deliberate trade-off.

> **Why one file?** The mobile wireframe was previously six separate SVGs (an `app-frame` shell plus
> five `content-*` forks). Each fork copied the entire ~1300-line chrome and swapped only its body,
> and editing six copies of one chrome caused **drift** (the verification ladder reached "Official"
> in one file but not the others; FAB-clearance padding went missing in two; a demo key behaved
> differently per file). This monolith keeps the shell, the data, the card, the filter, and the
> scaling logic **once**, and switches the five views with an in-file router — one source of truth,
> no drift. The original six files are kept **unmodified** in [`mobile/legacy/`](mobile/legacy/) for
> reference only; do not build from them.

## How to open

Double-click `mobile/oursay-mobile.svg`, or drag it into Chrome / Edge / Firefox. No build step, no
dependencies. (The GitHub/IDE inline SVG preview renders the picture but **does not run the script** —
open it in a real browser to use the interactions.)

---

## 1. The view router & page-flip map

The whole app is **one shell + five views**, switched by a router. The router is a registry plus a
`nav()` function — read these two first:

```js
var VIEWS = {
  feed:         { el:"vFeed", body:"vFeedBody", title:"Feed",         build:buildFeed,         max:0 },
  jurisdiction: { el:"vJur",  body:"vJurBody",  title:"Jurisdiction", build:buildJurisdiction, max:0 },
  district:     { el:"vDist", body:"vDistBody", title:"District",     build:buildDistrict,     max:0 },
  profile:      { el:"vProf", body:"vProfBody", title:"Profile",      build:buildProfile,      max:0 },
  post:         { el:"vPost", body:"vPostBody", title:"Post",         build:buildPost,         max:0 }
};
function nav(view) { state.view = view; state.scroll = 0; render(); }
```

`state.view` is the current screen. `render()` builds `VIEWS[state.view]`, shows only that view's
group (the rest are `display:none`), updates the header title and the left-margin caption, then runs
the shared chrome. There is exactly **one** of everything (one wheel-scroll, one filter, one FAB).

**Page-flip link map** — every clickable element and where it routes. `go("...")` is the click-handler
factory the builders use:

| You click… | …it flips to | Handler |
|---|---|---|
| a feed/inline card's **title**, **"…more"**, or its comment-count pill | **Post**, on the page matching that card's **record type** | `goPost(p.type)` |
| a Profile **Activity** row / **Mentions** row | **Post** (Statement/Petition/Poll page — non-root kinds fall back to Statement) | `goPost(kindToPostType(a.kind))` |
| a card **author**, a **comment author** (avatar + name) on the Post, or a **leader / riding-leader** link | **Profile** | `go("profile")` |
| a card's **jurisdiction tag** (underlined word) | **Jurisdiction** (aims it at that jurisdiction) | `goJur(name)` |
| a card's **district tag**, a **riding row**, or a profile's **riding** segment | **District** | `go("district")` |
| the jurisdiction selector's **↗ external glyph** | **Jurisdiction** (sets `state.jur`) | in `buildDropdown` |
| the **FAB** when not on the Feed, or Profile's **"View posts in Feed"** | **Feed** | `nav("feed")` |
| the **P** key | next view in `VIEW_ORDER` (cycles all five; always resets the Post view to Statement) | keydown |
| a Petition/Poll/Result page's **"See full X →"** interlink button (inside a collapsible section) | the matching Post-type page | `goPost(type)` |

The right-aligned scope tag on a card is built by `scopeTagLink(...)`: it **underlines only the
linkable words** (`Jurisdiction · District`) and lays an invisible hit target over each, so the
separator and any page-implied part stay plain. `goJur(name)` is `go("jurisdiction")` that first
points `state.jur` at the named jurisdiction.

These are **representative-target** flips: the wireframe always jumps to the one sample Post / Profile
/ District it ships, regardless of which card you tapped — extended by `goPost(type)` to one
representative sample **per record type** (Statement/Petition/Poll/Result, `POST_TYPES`), so a
tapped card always lands on the Post page matching its own type, not always the Statement. **In
production, route by the tapped record's id** — every `go(...)` / `goJur(...)` / `goPost(...)` /
`nav(...)` is the place to call `route(entityId)`. Genuinely deferred actions (composing a reply,
the account-settings rows) stay no-op stubs with a `NOTE(nav)`.

**The Post page** shows full author identity: the post author **and every comment author** are
linkable to their Profile (avatar + name), each carries a **verification pill** (`tierPill` — Identity
/ Residency / Official), and each shows a **relative timestamp** via `relTime()` — `Nm/Nh/Nd ago`, and
for anything **older than 6 days** an absolute `YYYY-MM-DD` date (the sample post itself is the >6d
case, dated `2026-06-22`). Handles are dropped on the Post to make room (identity is carried by the
linked name + pill). The post and any **revised** comment show an **"N edits"** link ("1 edit"
singular). The same **"N edits"** link appears in the **footer of feed / jurisdiction / district
cards** for any post that has been revised (`buildCard`).

**Petition / Poll / Result pages** share the Post view's chrome (`buildPostChrome`: author row,
title, full body) and comment thread, but each renders its own type-specific section — a Petition
shows its signature progress bar and Sign button (`petitionSign`, plus a collapsible "Proposed
Poll"/"Poll" section if it has an `attachedPoll`); a Poll shows its vote-option bars
(`buildPollOptions`, live `pollVote`) plus, when applicable, "Source Petition" and "Result"
collapsibles; a Result shows the same option bars **frozen** (no vote clicks — results are
immutable once published) plus "Poll" and "Petition" collapsibles. Each collapsible previews the
linked record and links to it via a **"See full X →"** button (`seeFullBtn`) — see
DESIGN-DECISIONS.md §9 for the reasoning, including the live petition→poll **graduation demo**
(signing the sample multi-district petition past its threshold flips its "Proposed Poll" tag/section
into a working "Poll" link, per `petitionGraduated()`).

**Every participatory action is login-gated, through one `requireAuth(action)`.** Reacting (✓/✗ on
the Post, in a comment thread, **and on a feed/jurisdiction/district card** via `reactClick`), signing
a petition (`petitionSign`), voting in a poll (`pollVote`), replying/commenting (`startReply`), and
creating a post (the FAB → `requireAuth(startCompose)`) all route through the same gate: logged-out
taps open the auth chooser and the action is dropped; signed-in taps perform it. **Reads stay open**
(browse / scope / filter work logged-out) — only writes need an account, mirroring the records they
create (one `reaction`/`vote`/`signature` per author per target). The gate is on **entry**, so you
can't even open the reply composer while logged out. Cards pass `scaleSocial` so their shown counts
still thin with the Verified filter; the Post shows its count raw.

**Alberta petitions/polls require a passkey WYSIWYS confirmation and are final; Global doesn't.**
Past the `requireAuth` gate, `petitionSign`/`pollVote` branch on `isFinalJur(p.jur)`: Global toggles
immediately (any signing-key type, changeable, revocable, exactly as before). Alberta instead opens
`signModal` — a "what you see is what you sign" restatement of the exact action ("I, {name}, am
signing my official support for the petition: '{title}'"; polls include the chosen option), a bold
FINAL/unrevokable notice, and a **"Sign with Passkey"** button (`confirmSign`) that performs the
actual commit. Once signed/voted in Alberta, the button/option is a no-op and its click affordance
is removed — replaced by a persistent "Final — cannot be revoked" note. If the account isn't
residency-verified (`state.kyc < 2`), a second notice warns the action won't count officially, and
`confirmSign` records it as the viewer's own without moving the official `sig`/`v` tally (mirrors
`civicExtra`'s additive-not-subtractive honesty model, §2). The same modal (a third `kind:
"compose"` variant, no FINAL notice) gates the compose "Post" button for Alberta Statement/Petition
creation. See DESIGN-DECISIONS.md §9.6.

**Petition creation is greyed out for non-residency-verified accounts in Alberta** — the compose
type picker still shows "Petition" (`typeLocked`) but disables it with a "Residency-verified only"
label, per `petition.md`'s Alberta rule. See DESIGN-DECISIONS.md §9.7.

---

## 2. Filter & verification model

One function decides what a list view shows — `matches(p, scope)` — replacing the three separate
matchers the forks had drifted apart. It encodes the filter matrix once:

```
matches(p, scope):
  record-type include  (all scopes)   → p.type's checkbox must be on
  Verified ladder      (all scopes)   → p.tier >= state.verified
  scope === "feed"         → p.jur is a subscribed+included jurisdiction
                             + My Districts: keep all Global, else only your ridings
  scope === "jurisdiction" → p.jur === state.jur (+ My Districts → your ridings)
  scope === "district"     → p applies to DISTRICT.slug (incl. multi-district posts)
```

**Record types** — Statements / Petitions / Polls / Results. Tap a checkbox to include/exclude (at
least one always stays on — never None); tap a name to switch to **only** that type. This section is
shown **only on the feed-bearing views** (`viewHasFeed()` → Feed, Jurisdiction, District). A single
Post or Profile has no card list, so the filter there drops the record-type section and shows only
**Refine** below (the Verified ladder + My Districts), which slides up to fill the gap.

**Verified ladder** — `VERIFIED_LEVELS = ["None","ID","Residency","Official"]`, one shared array.
The toggle cycles it; the filter is **inclusive upward** (`p.tier >= state.verified`): an **ID**
filter still shows Residency and Official authors; an **Official** filter shows only officials — a
resident does **not** appear. Author tiers: `0` public · `1` Identity · `2` Residency · `3` Official
(MLA / government).

**The count-scaling rule** (plain words): raising the Verified filter thins **social counts**
(comments + agree/disagree reactions) at **every** level — `SOCIAL_SCALE`. **Civic counts**
(petition signatures + poll votes) are **never thinned** — the bar/number is always the official
residency-verified total. Instead, *lowering* Verified below Residency reveals an **additive**
"+N unverified {signatures|votes}" note beside the bar — `CIVIC_UNVERIFIED_EXTRA = [.35, .12, 0, 0]`
(None · ID · Residency · Official) — surfacing participants who took part but aren't in the official
count, without ever moving the bar itself. *(Verified examples: a 204-agree post reads 204 → 126 →
69 → 16; a 7,999-signature petition's bar always reads 7,999, with "+2,800 unverified" at None,
"+960" at ID, and no note at Residency/Official.)* See DESIGN-DECISIONS.md §4.3/§9.5.

**My Districts** — a geography filter, **independent** of Verified. Only available to
residency-verified accounts (`state.kyc === 2`; otherwise greyed "Residency only"). It keeps **all
Global** posts and limits jurisdiction content to **your own ridings** (the sample resident's riding
is Edmonton-Strathcona). Toggle the account KYC tier from the profile modal's **Validate ID** button.

**Affected** — a second geography filter, shown in Refine **only on the Post page**, and only when
the open post is multi-district or jurisdiction-wide (`viewHasAffected`) — a single-district post
has no "other district" for it to mean anything, so the row doesn't appear there. It follows My
Districts' exact coupling to Verified/residency (§4.4 in DESIGN-DECISIONS.md), but keeps commenters
who are residency-verified residents of the post's **other** named districts (or, jurisdiction-wide,
any district) rather than my own; My Districts and Affected compose as an **OR** (`geographyKeep`).
See DESIGN-DECISIONS.md §9.4.

The **jurisdiction selector** scopes the unified Feed: tap a name → only that jurisdiction (→ Feed);
tap a checkbox (shown only with >1 jurisdiction) → include/exclude in the feed; tap ↗ → its
Jurisdiction view. The subscribed list is **saved to a cookie** and works logged-out (Global is the
default). On the Jurisdiction and District views the pill instead **names the view's jurisdiction**
(it tracks the page, not the filter).

---

## 3. Data model

All sample data lives in one block near the top of the script and maps to real OurSay entities (see
[`../docs/entities/`](../docs/entities/)):

| In the wireframe | Shape | Real entity |
|---|---|---|
| `POSTS[]` | `{ type, jur, tier, districts[], author, handle, title, body[], … metrics }` | a root content record — statement / petition / poll / result |
| `agree` / `disagree` | counts; `_my` on the Post view | `reaction` (✓/✗, mutually exclusive per author per target) |
| `sig` / `goal` | petition counts | `petition_signature` aggregate |
| `options[].v` | per-option counts | poll `vote` aggregate |
| `comments`, and `COMMENTS[]` tree | count + nested replies (depth ≤ `COMMENT_MAX_DEPTH = 3`); each node has `author/handle/tier/ts` and optional `edits` | `comment` |
| `tier` (0–3) | author verification | KYC tier / Official role |
| `ts` (ISO) + `relTime()` | created time → relative/absolute label (display-only; not the ordering source) | content record `createdAt` |
| `edits` (count) | times revised → "N edits" link to the deferred edit-history timeline | content/comment revision count |
| `districts[]` | `[]` = jurisdiction-wide · `[slug]` = one riding · `[slug,slug]` = several | `appliesToRegion` (district refs) |
| `JUR_DATA` | per-jurisdiction leader + rules + ridings (Global has neither map nor ridings) | JurisdictionConfig |
| `DISTRICT`, `PROFILE` | the single representative riding / public profile | District / public profile |
| `POST_TYPES` = `{ statement, petition, poll, result }`, each `{ post, comments }` | one representative Post-page sample **per record type** (`POST_STATEMENT`/`POST_PETITION`/`POST_POLL`/`POST_RESULT` + matching `COMMENTS_*`), selected by `state.postType` via `currentPostEntry()` | content record detail + its comment thread |
| `attachedPoll: { question, options[] }` on a petition | a pre-attached poll that graduates when `sig >= goal` (`petitionGraduated`) | the petition→poll graduation threshold (§8.6) |
| `sourcePetition` / `resultPublished` on a poll; `sourcePoll` / `sourcePetition` on a result | flags driving which "See full X" interlink collapsibles a Poll/Result page shows | poll↔petition / result↔poll,petition linkage |

Tiers and district lists are what the filter reads; the metrics are what the scaling thins.
`NOTE(tech)` comments flag the product assumptions (per-jurisdiction `contentLimits` for the compose
caps; the leader → public-profile link, which has no first-class entity yet).

---

## 4. Chrome flows (shared by every view)

The top bar, FAB, and all modals come from the shell and behave the same on every view.

- **Auth** — logged-out tap → register/login chooser. **Register** → a near-full-screen form
  (public profile + private KYC details + Canadian address used only to derive districts; the age
  gate is an **"I am 18 or older"** flag, no date of birth) → **verify** page (OTP boxes →
  **Register Passkey** enrols this device's passkey and signs you in). The chooser's **Log In**
  depends on the **OTP-login window** (toggle **O**): off → immediate passkey login; on → a modal
  offering email-OTP **or** passkey. All logins are passkey.
- **Profile modal** (logged-in, tap the avatar — distinct from the **Profile view**): KYC badge +
  **Validate ID** (cycles the tier), **Devices & passkeys** (Add Device / Add by Email), account
  settings rows (deferred no-ops except the live **Theme** toggle), Log out, legal links.
- **Compose** (the FAB on the Feed) — **where** (pick a jurisdiction; skipped with one selected) →
  **type** (the jurisdiction's allowed roots — Global: all; Alberta: Statement + Petition, with
  Petition greyed out ("Residency-verified only") for non-residency-verified accounts, `typeLocked`
  — skipped if only one available) → **compose** editor (type-specific: Statement = title+body;
  Petition adds a 60-char support-statement CTA; Poll = question + 2–10 options that scroll past
  five). "Post" submits immediately on Global; on Alberta it opens the same passkey WYSIWYS
  confirmation as signing/voting (§1, §9.6). Off the Feed the FAB is the **newspaper "go home"**
  icon → `nav("feed")`.

Every modal has a circular **✕** plus Esc / tap-outside; "Alt:" hint lines mark the alternative
dismissal.

---

## 5. Implementer's code-tracing guide

Read the script top-to-bottom in this order — it is organised to be traced:

1. **`state`** — the whole app's memory. Note `view` (router) and `scroll` (one unified offset);
   the collapsible-section flags are namespaced per view (`jur*` / `dist*`) so the two pages can't
   collide.
2. **constants & helpers** — `VERIFIED_LEVELS`, `KYC_TIERS`, `ROOT_TYPES`/`JUR_ROOTS`, then the tiny
   DOM helpers `$ / show / icon / txt / rect / clamp`.
3. **chrome builders** — `buildDropdown`, `buildFilter` (record types + the Verified/My-Districts
   refine), and the compose flow (`startCompose → enterType → enterCompose`, `buildWhere/buildType/
   buildComposeEditor`), then the auth `buildLoginInner`.
4. **the router** — `nav()` and `go()`, plus `onFabClick` / `onAuthClick`.
5. **data** — `JUR_DATA`, `POSTS`, `DISTRICT`, `PROFILE`, `POST_TYPES` (the four `POST_*`/`COMMENTS_*`
   detail-page samples).
6. **content helpers** — `tierLabel`, geography (`postDistricts/inMyDistricts/districtTag`), scaling
   (`scaleSocial` for social counts, `civicExtra` for the civic-count additive note — §4.3), the
   shared link/label bits (`initials/leaderLink/scopeTagLink/txtSeg/collHeader/seeFullBtn/
   drawMapVector/drawDistrictMap`), and the **one** reaction pill `reactBtn` → `reactClick` (the
   login gate + toggle every ✓/✗ in the app shares).
7. **`matches(p, scope)`** and **`buildCard(p, opts)`** — the one matcher and the one card renderer
   every list view calls.
8. **the five `build*` view functions**, then **`VIEWS` / `setViewScroll` / `render()`**, then the
   wiring and keydown.

**Scrolling** is uniform: every builder lays out content top-down and ends with `setViewScroll(key,
y)`, which sets `VIEWS[key].max = y + FOOTER_PAD - …` (so the FAB never covers the last line — `FOOTER_PAD
= 80`, applied in one place) and translates the body. The single wheel listener on `#content` clamps
`state.scroll` to the active view's `max`.

To wire the real build: replace the sample `POSTS`/`DISTRICT`/`PROFILE`/`POST` with API data, swap
each `go(view)` / `nav(view)` for `route(entityId)`, and keep `matches` + the scaling functions as
the read-model contract (record-type include → jurisdiction/scope → verification ladder → geography).

---

## 6. Keymap, conventions, legacy

| Key | Action |
|-----|--------|
| **L** | Toggle logged-in / logged-out. |
| **V** | Toggle annotation labels + arrows (the legend stays). |
| **F** | Toggle the feed filter dropdown (also: the filter circle). |
| **J** | Toggle the jurisdiction dropdown (also: the centre pill). |
| **A** | Open the Add-Jurisdiction spotlight modal. |
| **O** | Toggle the account's OTP-login window. |
| **G** | On the **Jurisdiction** view, flip Global ↔ Alberta (no-op elsewhere). |
| **P** | **Cycle the five views** (Feed → Jurisdiction → District → Profile → Post → Feed). |
| **S** | **Save the current view as a PNG** (downloads `oursay-wireframe-<view>.png`). |
| **Esc** | Close any open dropdown / modal. |

**Snapshot (S)** — `exportPNG()` serializes the live `<svg>`, paints it onto an off-screen `<canvas>`
at 2× over a white background, and downloads it as `oursay-wireframe-<view>.png`. It captures
**exactly what's on screen**, including any open modal, so it's the quickest way to grab a frame for a
doc or review. Everything is self-contained (no external fonts/images), so the export works even from
`file://`; if you ever embed an external image, serve over `http://` so the canvas isn't tainted.

**Layout** — the phone is centred on a wider canvas; all explanatory **red callouts live in the
margins** with leader arrows. The left-margin **Shortcut legend** is always visible (it does not
toggle with V). The per-view caption in the left margin updates as you switch views.

**Conventions** — pure-wireframe grayscale (`#333` strokes, `#e8e8e8`/`#efefef` fills, `#999`/`#bbb`
muted text); the FAB is filled dark as the primary action; the red `#c0392b` / `#e74c3c` is reserved
for callouts and the map highlight. Icons are mostly [Feather](https://feathericons.com) (MIT) glyphs,
inlined once as `<symbol>`s and reused via `<use href="#ic-…">`.

> **Icon preference: [Lucide](https://lucide.dev).** When an icon is missing from Feather (it's a small
> ~290-glyph set), source it from **Lucide** rather than another library. Lucide is Feather's actively
> maintained successor with the *same* 24×24 / 2px / round-cap design language, so its glyphs drop in
> without looking foreign. It's also the candidate for a future full swap. The **`ic-gavel`** symbol
> (Official tier) is already Lucide's `gavel` — Feather has no gavel.

**Legacy** — [`mobile/legacy/`](mobile/legacy/) holds the original six forks
(`app-frame`, `content-feed`, `content-jurisdiction`, `content-district`, `content-profile`,
`content-post`) **unchanged**, as a historical reference. They are superseded by
`oursay-mobile.svg`; build from the monolith.

---

## 7. Deferred — edit-history timeline

The **"N edits"** link on the Post (on the post itself and on revised comments) is wired to a stub
(`openHistory()`, a `NOTE(nav)` no-op). It is meant to open an **edit-history timeline**: a single
**chronological** view of a post's life — the original root post plus **every edit** made to it *and*
to its comments, laid out in order as an audit trail (nothing is silently rewritten). This view is a
**separate task** and is intentionally not built yet; the data model already carries the `edits`
count so the affordance can be shown today. When built, route `openHistory(target)` to it by the
tapped post/comment id.
