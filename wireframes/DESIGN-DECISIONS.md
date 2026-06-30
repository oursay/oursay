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

---

## 2. Identity & trust signals

### 2.1 Verification pills shown everywhere an author appears
- **Decision:** the author's verification tier renders as a small shield pill — **Identity /
  Residency / Official** — on feed cards, on the Post, and now next to **every comment author**. Tier
  0 (public) shows no pill. The pill darkens as the tier climbs (`tierShade`).
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

### 4.3 Raising the Verified filter also thins the counts
- **Decision:** with a higher Verified filter, the counts on the cards that remain shrink too.
  **Social** counts (comments + reactions) thin at every level (`SOCIAL_SCALE = [1, .62, .34, .08]`);
  **civic** counts (signatures + votes) hold through ID and Residency and only drop at Official
  (`CIVIC_SCALE = [1, 1, 1, .12]`).
- **Why:** a verified-only view is showing *fewer voices*, so the tallies should reflect that, not
  imply the full crowd agreed. Civic counts don't thin at the lower tiers because Alberta civic
  participation already requires residency — the lower filters wouldn't actually remove those voices.
- **Trade-off / rejected:** the Post detail shows its count **raw** (unscaled); a single record you've
  opened isn't a filtered list, so scaling it there would mislead.

### 4.4 "My Districts" is a separate geography axis
- **Decision:** My Districts is independent of the Verified filter, off by default, and only available
  to residency-verified accounts (otherwise greyed "Residency only").
- **Why:** "where" and "how verified" are different questions; bundling them would make either one
  impossible to use alone. District is inferred from address at query time, never stored on the user.

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

---

## 5. Space-saving choices

### 5.1 Drop the `@handle` on the Post and in comments
- **Decision:** the Post author row and comment rows no longer show `@handle`; a verification pill and
  a relative timestamp take that space instead.
- **Why:** on a phone, horizontal room is scarce. The linked **name + pill** already identify the
  author; the handle was the least information-dense thing on the line, and the timestamp/tier are
  more useful there. (Handles still appear where identity-by-handle matters, e.g. mentions.)
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

## 9. Open / deferred decisions

| Topic | State | Pointer |
|---|---|---|
| Edit-history timeline (post + comment edits, chronological) | Deferred; affordance + `edits` data shipped | §3.4, README §7 |
| Reply / comment submission | Stub (`NOTE(nav)`) | README §1 |
| Account-settings rows (Edit Profile, Address, Privacy) | Stubs except live Theme toggle | README §4 |
| Per-jurisdiction labels & content limits | Hardcoded sample; wire to `JurisdictionConfig` | `NOTE(tech)` in SVG |
| Visual design / theming beyond Light-Dark stub | Out of scope for the wireframe | §1.2 |

---

*When you change the wireframe in a way that alters one of these choices, update the matching entry
(or add a new one) so the reasoning stays with the artifact.*
