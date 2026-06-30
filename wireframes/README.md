# OurSay Wireframes

A **single, functional** mobile wireframe — [`mobile/oursay-mobile.svg`](mobile/oursay-mobile.svg).
It is one standalone SVG with an embedded script: open it in a browser and drive every screen with
the keyboard and mouse. It doubles as a clickable prototype and as the **build spec** for the real
app — a coder can implement OurSay mobile by tracing the well-commented logic inside it alongside
this guide.

> Context: OurSay has no product UI yet (Phase D). This wireframe explores the mobile shell on top of
> the journeys in [`../docs/11-USER-FLOWS.md`](../docs/11-USER-FLOWS.md).

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
| a feed/inline card's **title** or **"…more"** | **Post** | `go("post")` |
| a card **author**, or a **leader / riding-leader** link | **Profile** | `go("profile")` |
| a **riding row** on the Jurisdiction view | **District** | `go("district")` |
| the jurisdiction selector's **↗ external glyph** | **Jurisdiction** (sets `state.jur`) | in `buildDropdown` |
| the **FAB** when not on the Feed, or Profile's **"View posts in Feed"** | **Feed** | `nav("feed")` |
| the **P** key | next view in `VIEW_ORDER` (cycles all five) | keydown |

These are **representative-target** flips: the wireframe always jumps to the one sample Post / Profile
/ District it ships, regardless of which card you tapped. **In production, route by the tapped
record's id** — every `go(...)` / `nav(...)` is the place to call `route(entityId)`. Genuinely
deferred actions (composing a reply, the account-settings rows) stay no-op stubs with a `NOTE(nav)`.

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
least one always stays on — never None); tap a name to switch to **only** that type.

**Verified ladder** — `VERIFIED_LEVELS = ["None","ID","Residency","Official"]`, one shared array.
The toggle cycles it; the filter is **inclusive upward** (`p.tier >= state.verified`): an **ID**
filter still shows Residency and Official authors; an **Official** filter shows only officials — a
resident does **not** appear. Author tiers: `0` public · `1` Identity · `2` Residency · `3` Official
(MLA / government).

**The count-scaling rule** (plain words): raising the Verified filter doesn't only drop cards — it
also **thins the counts** on the cards that remain, because fewer qualifying voices are shown.
- **Social counts** (comments + agree/disagree reactions) thin at **every** level — `SOCIAL_SCALE`.
- **Civic counts** (petition signatures + poll votes) hold steady through ID and Residency and drop
  **only at Official** — `CIVIC_SCALE` — because Alberta participation already requires residency, so
  the lower filters don't thin them. *(Verified examples: a 204-agree post reads 204 → 126 → 69 → 16;
  a 1,240-signature petition reads 1,240 → 1,240 → 1,240 → 149.)*

**My Districts** — a geography filter, **independent** of Verified. Only available to
residency-verified accounts (`state.kyc === 2`; otherwise greyed "Residency only"). It keeps **all
Global** posts and limits jurisdiction content to **your own ridings** (the sample resident's riding
is Edmonton-Strathcona). Toggle the account KYC tier from the profile modal's **Validate ID** button.

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
| `comments`, and `COMMENTS[]` tree | count + nested replies (depth ≤ `COMMENT_MAX_DEPTH = 3`) | `comment` |
| `tier` (0–3) | author verification | KYC tier / Official role |
| `districts[]` | `[]` = jurisdiction-wide · `[slug]` = one riding · `[slug,slug]` = several | `appliesToRegion` (district refs) |
| `JUR_DATA` | per-jurisdiction leader + rules + ridings (Global has neither map nor ridings) | JurisdictionConfig |
| `DISTRICT`, `PROFILE`, `POST` | the single representative riding / public profile / post detail | District / public profile / content record |

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
  **type** (the jurisdiction's allowed roots — Global: all; Alberta: Statement + Petition; skipped if
  only one) → **compose** editor (type-specific: Statement = title+body; Petition adds a 60-char
  support-statement CTA; Poll = question + 2–10 options that scroll past five). Off the Feed the FAB
  is the **newspaper "go home"** icon → `nav("feed")`.

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
5. **data** — `JUR_DATA`, `POSTS`, `DISTRICT`, `PROFILE`, `POST`, `COMMENTS`.
6. **content helpers** — `tierLabel`, geography (`postDistricts/inMyDistricts/districtTag`), scaling
   (`scaleSocial/scaleCivic`), and the shared bits (`initials/leaderLink/collHeader/drawMapVector/
   drawDistrictMap`).
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
| **Esc** | Close any open dropdown / modal. |

**Layout** — the phone is centred on a wider canvas; all explanatory **red callouts live in the
margins** with leader arrows. The left-margin **Shortcut legend** is always visible (it does not
toggle with V). The per-view caption in the left margin updates as you switch views.

**Conventions** — pure-wireframe grayscale (`#333` strokes, `#e8e8e8`/`#efefef` fills, `#999`/`#bbb`
muted text); the FAB is filled dark as the primary action; the red `#c0392b` / `#e74c3c` is reserved
for callouts and the map highlight. Icons are [Feather](https://feathericons.com) (MIT) glyphs,
inlined once as `<symbol>`s and reused via `<use href="#ic-…">`.

**Legacy** — [`mobile/legacy/`](mobile/legacy/) holds the original six forks
(`app-frame`, `content-feed`, `content-jurisdiction`, `content-district`, `content-profile`,
`content-post`) **unchanged**, as a historical reference. They are superseded by
`oursay-mobile.svg`; build from the monolith.
