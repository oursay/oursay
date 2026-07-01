# OurSay Mobile — Design Decisions

Plain-language record of the **design choices** behind the mobile wireframe
([`mobile/oursay-mobile.svg`](mobile/oursay-mobile.svg)) and **why** each was made. It is the
companion to [`README.md`](README.md): the README explains *how the wireframe works and how to build
from it*; this file explains *why it looks and behaves the way it does* so future changes don't
quietly undo a deliberate trade-off.

> Scope: this is about the **product/UI** surface explored in the wireframe. The domain rules it sits
> on top of live in [`../docs/entities/`](../docs/entities/) and the privacy/identity choices in
> [`../docs/08-IDENTITY-AND-DEVICE-POLICY.md`](../docs/08-IDENTITY-AND-DEVICE-POLICY.md) and
> [`../docs/09-ACCOUNT-PRIVACY-MODEL.md`](../docs/09-ACCOUNT-PRIVACY-MODEL.md). Where a UI choice is
> really a domain rule, this file links out rather than restating it.

How to read each entry: **Decision** → what we did · **Why** → the reason · **Trade-off / rejected**
→ what we gave up or chose against. Keep that shape when you add to this file.

---

## 1. Foundations

### 1.1 One self-contained SVG, not a component tree
- **Decision:** the whole prototype is a single SVG with one embedded script — one shell plus five
  views switched by an in-file router.
- **Why:** it opens in any browser with no build step, doubles as a clickable prototype *and* the
  build spec, and keeps the data/card/filter/scaling logic in exactly one place.
- **Trade-off / rejected:** the earlier version was six forked SVGs; each copied the ~1300-line chrome
  and they **drifted** (the verification ladder reached "Official" in one file but not the others;
  padding and demo keys diverged). We accept a large single file to kill that drift. The six forks are
  kept unchanged in [`mobile/legacy/`](mobile/legacy/) for reference only.

### 1.2 Pure grayscale, colour reserved for meaning
- **Decision:** everything is grayscale (`#333` strokes, light fills, muted text). The only colour is
  the red `#c0392b`/`#e74c3c` used for explanatory callouts and the map highlight; the FAB is filled
  solid dark as the single primary action.
- **Why:** a wireframe should argue about **layout and hierarchy**, not brand or palette. Reserving
  colour for "pay attention here" keeps reviewers focused on structure.
- **Trade-off / rejected:** no theming exploration here beyond a Light/Dark **toggle stub** in the
  profile modal — visual design is a later phase.

### 1.3 Representative-target navigation
- **Decision:** every tap that should open a record jumps to the *one* sample Post / Profile / District
  the wireframe ships, regardless of which card you tapped.
- **Why:** a wireframe only needs to prove the *route exists* and where it lands, not carry a full
  database. Each `go()` / `goJur()` / `nav()` is the exact seam where production calls `route(entityId)`.
- **Trade-off / rejected:** we don't model per-record detail pages; genuinely unbuilt actions
  (submitting a reply, account-settings rows) stay honest no-op stubs marked `NOTE(nav)`.

### 1.4 Icons: Feather, with Lucide preferred for anything missing
- **Decision:** icons are inlined `<symbol>`s, mostly from [Feather](https://feathericons.com) (MIT).
  When a glyph isn't in Feather, take it from [Lucide](https://lucide.dev) rather than another set —
  e.g. `ic-gavel` (Official tier) is Lucide's `gavel` and `ic-pin-house` (residency neighbour, §2.1) is
  Lucide's `map-pin-house`, since Feather has neither.
- **Why:** Lucide is Feather's actively-maintained successor and shares the exact design language
  (24×24 grid, 2px round-cap strokes), so a borrowed glyph sits beside the Feather ones without looking
  foreign. Other libraries (Tabler, Phosphor, Material) carry a gavel too but with different stroke
  weights/proportions that would read as inconsistent at pill size.
- **Trade-off / rejected:** Lucide is the candidate for an eventual **full swap** (it's a near-superset
  of Feather); for now we mix the two and keep Lucide as the default source for new icons.

---

## 2. Identity & trust signals

### 2.1 Verification pills shown everywhere an author appears
- **Decision:** the author's verification tier renders as a small pill — **Identity / Residency /
  Official** — on feed cards, on the Post, and on **every comment**, always **right-justified to the
  row edge** (see §2.4). Each type has its **own glyph** (`tierIcon`): Identity = **ID badge**,
  Residency = **map pin**, Official = **gavel**. Tier 0 (public) shows no pill. The pill also darkens
  as the tier climbs (`tierShade`).
- **Why glyphs, not one shield:** a distinct icon per type is recognisable at a glance before the label
  is read, and the metaphors map to the thing verified — a badge for *who you are*, a pin for *where
  you live*, a gavel for *holding office*. The generic **shield** is kept only where verification is
  referenced as a *category* rather than a specific type — the "Verified" filter row.
- **Residency neighbours get a map-pin-*house*:** a Residency-verified author **in my own district**
  shows Lucide's `map-pin-house` instead of the plain pin — but only when **I** am residency-verified
  (`isHomeAuthor`: `state.kyc >= 2` + district overlap). The label stays "Residency"; only the glyph
  changes. **Why:** "a verified neighbour in your riding" is a stronger civic signal than "verified
  somewhere," and it's the same residency-gated lens as **My Districts** (§4.4) — if you can't see
  districts, the distinction isn't surfaced. It rides on the existing pill, so it costs no extra space.
- **Why:** in a civic space, *who is speaking* and *how strongly they're verified* is first-class
  information; it should be visible at the point of reading, not buried in a profile. Darker = more
  verified gives an at-a-glance signal without reading the label.
- **Trade-off / rejected:** pills add visual weight, so they are sized to **hug the word** (widths
  estimated by `textW`, narrow glyphs counted as less) rather than sit in fixed boxes.

### 2.2 The verification *filter* is inclusive upward
- **Decision:** the Verified ladder (None → ID → Residency → Official) filters `tier >= selected`. An
  "ID" filter still shows Residency and Official authors; "Official" shows only officials.
- **Why:** people expect "show me at least this verified" not "show me exactly this tier". Tiers are
  set membership, not a strict ladder — see [verification.md](../docs/entities/account/verification.md).

### 2.3 Profiles are linkable from the content, not just the avatar
- **Decision:** the post author **and every comment author** (avatar + name together) link to that
  person's Profile.
- **Why:** readers follow people through what they say. Making the name in a thread a link is the
  natural path to "who is this and what else have they posted".
- **Trade-off / rejected:** see §5.1 — to make room for the pill and timestamp we dropped the
  `@handle` from these rows.

### 2.4 Comment row anatomy: `Name • time` left, verification pill right
- **Decision:** a comment header reads **avatar → bold Name → `•` → relative time** on the left (the
  avatar+name are one tap target to the author's Profile; the time follows the name after a single-space
  `•` bullet separator), and the **verification pill is right-justified** to the row's right edge.
  Replies nest visually up to **`COMMENT_MAX_DEPTH` = 3**; a reply *beyond* that depth flattens to a
  **sibling** at the deepest level and is seeded with the replyee's **`@handle`** as its first token.
- **Why:** the **right-justified pill** matches the feed cards and the Post author row exactly, so the
  eye finds "how verified is this person" in the *same* spot whether scanning a list or reading a
  thread — consistency beats packing the pill inline next to the name. `Name • time` is the familiar
  social-thread convention and reads as one glance. Capping nesting at 3 keeps deep threads legible on
  a phone (runaway indentation eats the already-narrow column); once indentation can no longer show
  "who replied to whom," the seeded **`@handle`** carries that relationship instead.
- **Trade-off / rejected:** earlier the pill sat **inline after the name** with the timestamp pushed
  to the far right — rejected because the pill's position then drifted with name length and didn't line
  up with the rest of the app. The `@handle` reappears **only** in these flattened max-depth replies —
  the single place §5.1's handle-drop is intentionally reversed, because at that point identity-by-handle
  is exactly what disambiguates a reply that has lost its indentation.

---

## 3. Time & edit history

### 3.1 Relative timestamps, with a 6-day cutoff to absolute dates
- **Decision:** `relTime()` shows `just now` · `Nm ago` · `Nh ago` · `Nd ago` up to **6 days**, then
  switches to an absolute `YYYY-MM-DD` date.
- **Why:** recent activity reads more naturally as "3h ago"; older activity reads more honestly as a
  real date than "37d ago". Six days is the point where day-counting stops being intuitive (you start
  doing mental arithmetic), so that's the handover.
- **Trade-off / rejected:** the wireframe pins a fixed `NOW` (2026-06-30, matching the 9:41 status
  bar) so the static file always reads consistently; production reads the real clock.

### 3.2 Timestamps are display-only, never the ordering source
- **Decision:** the times shown are presentation, not the canonical order of events.
- **Why:** aligns with the project's [decentralization north star](../docs/07-DECENTRALIZATION-ALIGNMENT.md)
  — never trust a single device clock for civic ordering. The record's own ordering is authoritative;
  the UI just labels it for humans. (Flagged inline in the SVG as a `NOTE(tech)`.)

### 3.3 An explicit "N edits" marker
- **Decision:** a post or comment that has been revised shows an **"N edits"** link ("1 edit"
  singular) — on the Post, on revised comments, and in the footer of feed/jurisdiction/district cards.
- **Why:** in a civic record, edits must be **visible, never silent**. Showing the count up front
  signals "this changed after posting" and gives a handle to inspect what changed.
- **Trade-off / rejected:** we considered hiding the count until you open history, but that hides the
  very fact an edit happened — the opposite of the goal.

### 3.4 The edit-history timeline is deferred, but the hook is built
- **Decision:** tapping "N edits" is wired to a stub (`openHistory()`); the full **chronological
  edit-history timeline** (root post + every edit to it and its comments, as an audit trail) is a
  separate task. The data already carries the `edits` count so the affordance can ship now.
- **Why:** surfacing the *signal* (something was edited) is valuable immediately; building the full
  diff/timeline view is a larger piece of work that shouldn't block the rest of the page.

### 3.5 The Activity tab records edits and reaction changes as real actions
- **Decision:** a person's Activity feed includes **post edits**, **comment edits**, **reaction
  changes** ("Changed to Disagree on …"), and **reaction retractions** ("Retracted reaction on …") —
  not only the original create/sign/vote/react.
- **Why:** consistent with §3.3 — a public civic history shows revisions and reversals, it doesn't
  quietly rewrite the past. An edit filters under its content type (a post edit hides when
  *Statements* is off); changes and retractions filter under *Reactions*.
- **Trade-off / rejected:** edits reuse the existing kind for filtering and just override the **icon**
  (a pencil), rather than introducing a separate "edits" filter axis that would fragment the toggles.

---

## 4. Reading the feed (filtering & counts)

### 4.1 One matcher, one card renderer for all list views
- **Decision:** Feed, Jurisdiction, and District all run through a single `matches(p, scope)` and a
  single `buildCard()`.
- **Why:** the three list views differ only in *scope*; sharing the matcher and the card guarantees
  they can't drift apart (the original sin of the six forks).

### 4.2 Record-type filter: include-checkboxes plus tap-to-isolate
- **Decision:** Statements / Petitions / Polls / Results each have an include checkbox (at least one
  always stays on — never None); tapping a *name* switches to **only** that type.
- **Why:** two real intents with one control — "hide this kind" (checkbox) and "show me just this
  kind" (tap the name) — without a separate mode switch.

### 4.3 Raising the Verified filter thins SOCIAL counts; CIVIC counts are always additive, never thinned
- **Decision:** with a higher Verified filter, **social** counts (comments + reactions) thin at
  every level (`SOCIAL_SCALE = [1, .62, .34, .08]`). **Civic** counts (petition signatures, poll
  votes) are **never thinned** — the bar and its number are always the official, residency-verified
  total. Instead, lowering Verified **below Residency** reveals an **additive** "+N unverified
  {signatures|votes}" note beside the bar: `CIVIC_UNVERIFIED_EXTRA = [.35, .12, 0, 0]` (None · ID ·
  Residency · Official) — None surfaces the largest addition, ID a smaller one, Residency/Official
  show nothing (there's nothing left to add — everyone shown already qualifies).
- **Why:** a verified-only view is showing *fewer voices*, so social tallies should reflect that —
  but a petition/poll's bar is a **formal count against a threshold or a ballot**, not a casual
  tally; silently shrinking it as Verified rises would misrepresent progress toward a real goal.
  "Official" verification is a comment/reaction-author distinction (MLA / government) — it was never
  a meaningful tier for *who gets counted* on a civic bar, so it shouldn't gate the bar either. The
  additive note instead answers the honest question "how many more people took part, beyond the
  count that's officially certified?" without ever moving the bar itself.
- **Trade-off / rejected:** an earlier version (`CIVIC_SCALE = [1,1,1,.12]`) *dropped* civic counts
  at Official — rejected once petitions/polls got detail pages, since a bar that shrinks against its
  own stated goal (e.g. "X / 8,000 signatures" reading a smaller X at a higher filter) reads as the
  goalposts moving, not as "fewer voices are shown."
- **Where it reaches:** the additive note appears wherever a civic bar does — feed/jurisdiction/
  district cards, the Petition page's progress bar, and beside **each** Poll/Result option bar
  (`buildPollOptions`). It always sits on its **own line**, clear of the bar/tag, so it never crowds
  a variable-width caption. Reaction tallies are still thinned by the filter everywhere they appear —
  feed cards, the **Post**, and **its comments** — so the discussion you're reading reflects the same
  verified-only view as the list you came from (consistent with comment filtering, §4.6). The one
  count left **raw** is the comment-count **pill**, which reports the record's true total (the "N
  hidden by filters" note, §4.6, already explains the gap between that total and what's shown).

### 4.4 "My Districts" is coupled to the Verified filter (inferable only at Residency+)
- **Decision:** My Districts is a geography filter, off by default, available to residency-verified
  accounts. It is only **inferable** when the **Verified filter** sits at **Residency or Official** —
  at None/ID it **disengages** (greyed, "Residency+") because lower-tier authors have no verified
  district to match. The toggle **remembers its intent** across Verified changes, and turning it on
  **jumps Verified up to Residency** (Official stays put). It applies to the feed, the jurisdiction
  list, **and comments**.
- **Why:** a district can only be known for residency/official-verified people, so geographic filtering
  is meaningless while the list still includes lower tiers — coupling keeps the filter honest. But a
  user who briefly drops the Verified filter shouldn't silently lose their geography choice, hence the
  remembered intent; and "show my district" should just work, hence the one-tap Verified-jump.
- **Trade-off / rejected:** the earlier model treated the two axes as fully independent — rejected
  because it let you "filter to my district" over a feed that still included unverified authors with no
  inferable district, which is incoherent. District is still inferred from address at query time, never
  stored on the user.
- **Mechanics:** `state.myDistricts` = remembered intent; `effectiveMyDistricts()` = intent **&&**
  residency account **&&** Verified ≥ Residency — the single predicate used by both the feed matcher
  and the comment thread, so every list and **every filter modal** disengages together.

### 4.5 Every participatory action is login-gated through one gate
- **Decision:** all participation runs through a single `requireAuth(action)` — logged-out taps open
  the auth chooser and the action is dropped; signed-in taps perform it. This covers, with no
  exceptions:
  | Action | Where it appears | Function |
  |---|---|---|
  | React ✓/✗ | Post, comments, every card | `reactClick` |
  | Sign a petition | petition cards | `petitionSign` |
  | Vote in a poll | poll cards | `pollVote` |
  | Reply / comment | Post + every comment | `startReply` |
  | Create a post (FAB) | Feed | `onFabClick` → `requireAuth(startCompose)` |
- **Why:** one gate, one behaviour — there is no surface where you can start an action logged-out only
  to be stopped halfway, and no second copy of the gate logic to drift. Reads stay open (browse, scope,
  filter all work logged-out, §7); only **writes** require an account, mirroring the records they
  create (e.g. one `reaction`/`vote`/`signature` per author per target).
- **Trade-off / rejected:** the FAB used to inline its own logged-out check (a near-duplicate of
  `requireAuth`); it was refactored to call `requireAuth(startCompose)` so compose is gated by the
  *same* path as everything else. The gate is on **entry** to the action (you can't even open the
  reply composer logged-out), not on submit.

### 4.6 The Verified + My Districts filters also prune comments (with reply-promotion)
- **Decision:** the same Verified ladder **and** the My Districts geography filter that filter feed
  cards now also apply to **comments** on the Post — a comment whose author is below the selected tier,
  or (under an engaged My Districts, §4.4) names a district that isn't mine, is hidden. District-less
  comments (e.g. officials) are **kept** by My Districts. A hidden comment's **qualifying replies are
  promoted** up to its level, so a surviving reply under a filtered parent still shows. A right-aligned
  **"N hidden by filters"** note sits by the Comments header; the comment-count pill keeps the record's
  **true total**.
- **Why:** a reader who has filtered to "Residency+" expects that to apply to the *discussion* too, not
  just the list of posts. Promotion preserves the inclusive-upward intent (§2.2) — you never lose a
  higher-tier voice just because its parent was lower-tier. The note keeps it honest that you're seeing
  fewer comments by choice, echoing the count-thinning of §4.3.
- **Trade-off / rejected:** pruning whole subtrees (simpler) was rejected — it would hide an *Official*
  reply merely because it sat under an unverified comment, the opposite of inclusive-upward. The post
  itself is never filtered (you navigated to it directly); only its comments are.

---

## 5. Space-saving choices

### 5.1 Drop the `@handle` on the Post and in comments
- **Decision:** the Post author row and comment rows no longer show `@handle`; the relative timestamp
  takes its inline spot next to the name and the verification pill sits right-justified (§2.4).
- **Why:** on a phone, horizontal room is scarce. The linked **name + pill** already identify the
  author; the handle was the least information-dense thing on the line, and the timestamp/tier are
  more useful there. (Handles still appear where identity-by-handle matters — e.g. mentions and the
  flattened max-depth replies in §2.4.)
- **Trade-off / rejected:** the data keeps `handle`; this is purely a display choice and can be undone
  per surface.

### 5.2 Pills and tags hug their text
- **Decision:** verification pills, comment pills, and edit links are sized from an estimated text
  width (`textW`) rather than fixed widths.
- **Why:** fixed-width chips waste space and leave "Official" and "Identity" looking unbalanced;
  hugging the word keeps rows tight and lets several signals share one line.

---

## 6. Profile page

### 6.1 Minimal text tabs, active = bold + underline
- **Decision:** Posts / Activity / Mentions are plain text tabs; the active one is **bold with a short
  underline**, the rest are muted. Each tab is only as wide as its label.
- **Why:** the previous segmented control forced every tab to a fixed third of the width and carried
  heavy chrome (track, dividers, filled pill). Plain underlined text is lighter, reads as standard tab
  navigation, and frees screen real estate — leaving room to add tabs later without crowding.
- **Trade-off / rejected:** a segmented pill control (rejected) looks more "button-like" but eats
  vertical and horizontal space and fights the otherwise minimal page.

### 6.2 Fixed header, only the list scrolls
- **Decision:** the identity header, stats, and tabs stay pinned; only the list below the tabs scrolls
  (clipped to its own viewport).
- **Why:** you should always see *whose* profile this is and be able to switch tabs without scrolling
  back up.

### 6.3 The profile's type filter is its own axis
- **Decision:** the profile reuses the filter control but with a **different set** — Statements,
  Comments, Petitions, Polls, Reactions (no Results; plus Comments and Reactions) — and it gates the
  Posts and Activity lists.
- **Why:** a profile is "things this person did", which includes comments and reactions; the feed is
  "root content in a scope", which doesn't. Same control, scope-appropriate options.

---

## 7. Auth & account (summary — see policy docs)

- **Decision:** all logins are **passkey-first**; email-OTP only appears for the explicit OTP-login
  window and for adding a new device. Registration takes a public profile + private KYC details +
  address (used only to derive districts), and the age gate is a single **"I am 18 or older"** flag —
  **no date of birth**.
- **Why:** minimise stored PII and avoid password liabilities. Address derives districts at query time
  and is never public; a yes/no age flag is all the civic rules need. Full reasoning lives in
  [08-IDENTITY-AND-DEVICE-POLICY.md](../docs/08-IDENTITY-AND-DEVICE-POLICY.md) and
  [09-ACCOUNT-PRIVACY-MODEL.md](../docs/09-ACCOUNT-PRIVACY-MODEL.md).
- **Decision:** subscribed jurisdictions are saved to a **cookie** and work **logged-out** (Global is
  the default).
- **Why:** browsing and choosing scope shouldn't require an account; only *acting* (reacting, signing,
  posting) does.

---

## 8. Counts, privacy floors, and honesty

- **Decision:** result/aggregate copy notes a **k-anonymity floor** ("Counts appear once past the
  k-anonymity floor"), and verified civic counts are labelled as residency-verified electors only.
- **Why:** showing a tally implies a crowd; below a small-N floor that can de-anonymise participants,
  so the UI is explicit that counts only appear once safe — honesty about what a number means is part
  of the design, not a footnote.

---

## 9. Representative detail pages & the graduation demo

### 9.1 Every record type gets its own representative Post page
- **Decision:** the Post view previously always showed the one sample Statement, regardless of
  which card was tapped. It now holds **one representative sample per type** — Statement, Petition,
  Poll, Result (`POST_TYPES`) — and a tap routes to the matching one via `goPost(type)` (a second
  representative-target factory alongside `go()`/`goJur()`, §1.3). `p.type` already names a
  `POST_TYPES` key, so `buildCard`'s title/"…more"/comment-pill hits need no extra mapping; the
  Profile page's Activity rows (whose `kind` values include non-root kinds like `comment`/
  `reaction`) and Mentions rows (no `kind` at all) fall back to the Statement page via
  `kindToPostType()` — the same representative-target approximation already used everywhere else.
- **Why:** a wireframe that only ever proves "the Post route exists" for one type can't show what's
  actually *different* about a Petition, Poll, or Result page — the whole point of this round of
  work. Keeping one fixed sample per type (not per record id) stays faithful to §1.3's reasoning:
  the wireframe only needs to prove each route/layout exists, not carry a full database.
- **Trade-off / rejected:** the **P** keyboard shortcut still always lands the Post view on the
  Statement (it resets `state.postType` before navigating) — it's documented as cycling *views*,
  or a per-type cycle would silently change that contract. Only tapping an actual card demos the
  new pages.

### 9.2 The petition → poll graduation demo is live, not narrated
- **Decision:** one sample petition (multi-district: Edmonton-Strathcona + Edmonton-City Centre)
  carries an `attachedPoll` one signature below its `goal`. Signing it (from its feed card *or*
  its Post page — both call the same `petitionSign`) increments `p.sig` live; once `p.sig >= p.goal`,
  `petitionGraduated(p)` flips both the card's caption and the Post page's collapsible from
  **"Proposed Poll"** (question + options preview, no link) to **"Poll Open"** / **"Poll"** (same
  preview, plus a working **"See full Poll →"** link). The card tag itself replaces the plain
  "X / Y signatures" line with a compact "✓ Proposed Poll · Y signatures" tag (icon: the existing
  `ic-check-circle`) — the progress bar and Sign button underneath are unchanged. Once graduated,
  the tag **itself becomes clickable** (feed card *and* Post page) and opens the Poll page directly,
  in addition to the Post page's dedicated "See full Poll →" button.
- **Why:** per `01-CONTRIBUTOR-SPEC.md` §8.6, Alberta's poll level exists *only* by a linked
  petition crossing a verified-signature threshold — this is a real, documented mechanic, not
  wireframe flavour, so it's worth demonstrating as an actual interaction rather than static copy.
  Making the graduated tag itself clickable (not just a separate button on the detail page) means
  the *shortest* path to the poll — tapping the badge that announces it exists — actually works,
  from the feed as well as the petition's own page.
- **Trade-off / rejected:** clicking "See full Poll" always opens the **one** representative Poll
  page (`POST_POLL`) — it does not synthesize a unique poll from this petition's data, and no new
  poll is added to the feed. That would require real cross-record linkage the wireframe doesn't
  model; representative-target navigation (§1.3) already accepts this kind of approximation (every
  comment author already links to the same one Profile, regardless of which comment you tapped).
  `petitionSign` incrementing `p.sig` on *every* petition (not just this one) is harmless: no other
  sample starts at or above its goal, so no other card's progress bar or caption changes behaviour.

### 9.3 Interlinks between Petition, Poll, and Result
- **Decision:** each of the three graduated-content pages carries collapsible sections
  (`collHeader`, as already used on Jurisdiction/District) linking to the others: Petition → Poll
  (§9.2); Poll → Source Petition and → Result; Result → Poll and → Petition (transitive, per
  `result.md`'s "Petition / Post — transitive — via poll links upstream"). Each section previews
  the linked record's title/outcome text and a "See full X →" button (`seeFullBtn`).
- **Why:** a reader following a civic decision from petition to poll to result should be able to
  move in either direction without leaving the thread they're reading, mirroring how the platform's
  own content hierarchy (Statement → Petition → Poll → Result) is meant to read as one escalating
  story, not four disconnected record types.

### 9.4 The Affected filter — Post-page-only, parallel to My Districts
- **Decision:** a second geography filter, `state.affected`, appears in the filter modal's Refine
  section **only** when the open Post is multi-district or jurisdiction-wide
  (`postQualifiesForAffected` / `viewHasAffected`) — never on a single-district post, and never as
  a feed/jurisdiction/district-level filter. It follows My Districts' exact coupling mechanics
  (§4.4: residency-verified only, inferable only at Verified ≥ Residency, remembered intent that
  disengages without forgetting, turning it on jumps Verified to Residency). Where My Districts
  keeps commenters who **are** in my home district, Affected keeps residency-verified commenters
  from the post's **other** named districts (or, for a jurisdiction-wide post, any district) —
  **not** my own. The two compose as an **OR**: since "mine" and "not mine" are mutually exclusive,
  a comment survives if it qualifies for either engaged filter.
- **Why:** on a post naming several ridings (or the whole jurisdiction), "My Districts" alone only
  shows a resident their own neighbours — it can't answer "what is everyone this actually affects
  thinking," which is exactly the audience a multi-district or jurisdiction-wide record has. A
  single-district post has no "other district" for this to mean anything, so the control doesn't
  appear there at all.
- **Trade-off / rejected:** Affected's remembered intent is guarded by `viewHasAffected()` inside
  `effectiveAffected()` itself (not just at the point the row is drawn) — without that, toggling it
  on for one multi-district post and then navigating to a different, single-district post would
  silently keep filtering that post's comments even though the control isn't shown there anymore.

### 9.5 One bottom bar shape across all four Post-page types
- **Decision:** the Post page's action row — reactions-or-civic-count, Reply, "N edit(s)", comment
  count — is now built **once**, branching only on what goes in the left slot: `reactPill` for
  Statement/Result, a plain "X signatures"/"X votes" count (unscaled — §4.3) for Petition/Poll. All
  four types get **Reply** and a **comment-count pill**, since Comment is 1:N on every content type
  (`petition.md`/`poll.md`/`result.md` all list it), not just Statement/Result.
- **Why:** the Petition and Poll pages previously had no visible signature/vote count at all next to
  Reply/comments (only the caption above the Sign/vote controls carried a number), unlike the feed
  card, which already showed one in its footer — an inconsistency between the card and its own
  detail page. Building this row once, branching only the left slot, is the same anti-drift
  reasoning as `buildCard`'s single footer branch.
- **Trade-off / rejected:** the Petition page adds extra vertical clearance below the Sign button
  (and again below the "+N unverified" note, when shown) before this row starts, so the row never
  reads as crowding the button above it; the Poll page's total-votes figure moved from its own line
  above the row into the row itself, matching the Petition treatment instead of standing apart.

---

## 10. Open / deferred decisions

| Topic | State | Pointer |
|---|---|---|
| Edit-history timeline (post + comment edits, chronological) | Deferred; affordance + `edits` data shipped | §3.4, README §7 |
| Reply / comment submission | Stub (`NOTE(nav)`) | README §1 |
| Account-settings rows (Edit Profile, Address, Privacy) | Stubs except live Theme toggle | README §4 |
| Per-jurisdiction labels & content limits | Hardcoded sample; wire to `JurisdictionConfig` | `NOTE(tech)` in SVG |
| Visual design / theming beyond Light-Dark stub | Out of scope for the wireframe | §1.2 |
| Automated graduation engine (real, off-wireframe) | `[code-jurisdiction-graduation]` gap — the wireframe's live petitionSign demo is illustrative only | petition.md, poll.md, jurisdiction.md |
| Non-residency-verified warning modal (Alberta petitions/polls) | Deferred — a popup should tell a signer/voter who isn't residency-verified that their signature/vote won't count toward the official (Alberta) tally until they verify, before `petitionSign`/`pollVote` commits | §9.2, §4.3, next task |

---

*When you change the wireframe in a way that alters one of these choices, update the matching entry
(or add a new one) so the reasoning stays with the artifact.*
