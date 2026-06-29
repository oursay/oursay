# OurSay Wireframes

Low-fidelity, **functional** wireframes built as standalone SVG files. Each SVG embeds a small
script, so you can open it directly in a browser and drive its states with the keyboard and mouse —
it doubles as a clickable prototype and as a template other views are forked from.

> Context: OurSay has no product UI yet (Phase D). These wireframes explore the mobile shell on top
> of the journeys mapped in [`../docs/11-USER-FLOWS.md`](../docs/11-USER-FLOWS.md).

## How to open

Double-click the `.svg` file, or drag it into Chrome / Edge / Firefox. No build step, no
dependencies. (Note: the GitHub/IDE inline SVG preview renders the picture but **does not run the
script** — open it in a real browser to use the interactions.)

## Files

| File | What it is |
|------|------------|
| [`mobile/app-frame.svg`](mobile/app-frame.svg) | The reusable mobile app-frame template: top bar (jurisdiction selector + login/profile), placeholder Feed, and the bottom-right new-post FAB. |
| [`mobile/content-feed.svg`](mobile/content-feed.svg) | **Feed** — a filter-driven list of post-type cards (faked data). The filter matrix (record types × subscribed jurisdictions × Refine) decides which cards show. |
| [`mobile/content-jurisdiction.svg`](mobile/content-jurisdiction.svg) | **Jurisdiction page** — title bar (name + leader link), collapsible **Map** (red-highlighted region, hidden for Global), collapsible **Rules**, collapsible **Districts** (hidden for Global, "Ridings" for Alberta), and an inline collapsible **Jurisdiction Feed** pre-filtered to the jurisdiction. |
| [`mobile/content-district.svg`](mobile/content-district.svg) | **District / riding page** — title bar (name + seated-MLA link), single-region map, collapsible **About this riding**, Posts link-out. |
| [`mobile/content-profile.svg`](mobile/content-profile.svg) | **Public profile** — a leader/member persona (identity header, activity stats, Posts link-out). Distinct from the account profile *modal* (settings) in the chrome. |
| [`mobile/content-post.svg`](mobile/content-post.svg) | **Post detail** — the full post + a comment thread nested to depth 3, with tap-to-toggle agree/disagree on the post and every comment. |

### Content views (forks of `app-frame.svg`)

The five `content-*.svg` files are the first **forks** of the template (see the Fork contract
below): each keeps the chrome + `<script>` and swaps the `#content` group, adding a little
page-specific state and a builder hooked into `render()`. They inherit every chrome interaction
(F / J / A / L / O / P / V / Esc, the filter + selector dropdowns, auth/compose modals, the FAB).

Page-specific keys / clicks:

- **content-feed** — **F** (or the filter circle) opens the filter; toggling record types, cycling
  **Verified**, toggling **My Districts**, or changing the jurisdiction selection re-filters the
  cards live. **Wheel** scrolls the list. On a card, the **title** and **"…more"** both open the
  post (same target); the **author name** opens that profile.
- **content-jurisdiction** — **G** flips the page between **Global** and **Alberta** (to show the
  Map/Ridings-hidden-for-Global behaviour and the differing Rules). Every section is collapsible
  with a leading icon and a chevron on the **right**: **Map** (a pretend map vector with a
  red/translucent highlight), **Rules**, **Ridings**, and a collapsed-by-default **Jurisdiction
  Feed** — an inline post list pre-filtered to this jurisdiction (record type & Refine still apply).
  Leader links are right-aligned **initials avatars** (no arrow). **Wheel** scrolls, and a footer
  whitespace pad keeps the FAB from ever covering a heading at full scroll.
- **content-district** — click **About this riding** to collapse/expand; **wheel** scrolls.
- **content-post** — tap **✓ / ✗** on the post or any comment to toggle your agree/disagree
  (mutually exclusive, like a `reaction`); the thread stops nesting at **depth 3**
  (`COMMENT_MAX_DEPTH`); **wheel** scrolls.

**Navigation is deferred in-file stubs.** Cross-page links (card title/"…more" → post, external
glyph → jurisdiction, leader link → profile, riding name → district) are **no-op handlers**
carrying a `NOTE(nav)` that names the target file — mirroring the app-frame external glyph. There
are no real cross-file `<a href>` links; open each file directly to explore it. On a content page
the **FAB is locked to the newspaper "go to Feed" (home) icon** — the feed/compose toggle (P) is
disabled there, since the page is static. The **Jurisdiction** page embeds an inline pre-filtered
feed (still in-file); the **district / profile** pages keep a lighter **link-out placeholder**
(`→ View posts in Feed`). Where a page makes a product assumption (card metric sourcing; the
leader/seated-official → public-profile link, which has no first-class entity today) there is an
inline `NOTE(tech)` for the doc/API teams.

## Layout

The phone display is centred on a wider canvas. The screen itself stays a clean, pure-wireframe
mock; all the explanatory **red callouts live in the margins** around the phone with leader arrows
pointing back to each element. A grayscale **Shortcut legend** sits in the left margin and is
**always visible** (it does not toggle with V). Icons are real [Feather](https://feathericons.com)
(MIT) glyphs, inlined as `<symbol>`s and drawn with `<use>`.

## Keymap (legend is always shown in the margin)

| Key | Action |
|-----|--------|
| **L** | Toggle logged-in / logged-out (right button switches login ↔ profile; subscribed list reflects it). |
| **V** | Toggle annotation labels + arrows + keymap legend. |
| **F** | Toggle the feed filter dropdown (also: click the filter circle, top-left). |
| **J** | Toggle the jurisdiction dropdown (also: click the centre selector pill). |
| **A** | Open the Add-Jurisdiction spotlight modal (also: the "+ Add Jurisdiction" button). |
| **O** | Toggle the account's **OTP-login-allow window** (changes what the Log In modal offers). |
| **P** | Toggle current page (Feed ↔ other) to demonstrate the FAB icon swap. |
| **Esc** | Close any open dropdown / modal. |

Clicks mirror the keys: filter circle → filter dropdown, selector → jurisdiction dropdown,
"+ Add Jurisdiction" → modal, backdrop → close, **Alberta** → add/remove, login button → auth modal.

### What the states show

- **Top bar layout**: a **filter circle** (left), the **jurisdiction selector** pill (centre), and
  the **login / profile** circle (right). The filter and jurisdiction dropdowns are mutually
  exclusive — opening one closes the other.
- **Feed filter** (left circle): a dropdown with two independent sections.
  - **Record types** — **Statements, Petitions, Polls, Results**, using the same interlock as the
    jurisdiction list: tap a **checkbox** to include/exclude a type in the feed (at least one always
    stays selected — never None), or tap a **name** to switch to **only** that type. No external
    links, no "add" button.
  - **Refine** — a **Verified** value toggle cycling **None → ID → Residency** (minimum author
    verification; the row is **dimmed at None**), and a **My Districts** visibility toggle shown as an
    **eye / closed-eye** (open eye = shown, struck-through eye = hidden; defaults to **off**).
    **My Districts is only available to residency-verified accounts** (otherwise the row is greyed
    with a "Residency only" note), and it is **interlocked with Verified**: turning My Districts on
    jumps **Verified → Residency**, and changing Verified to anything below Residency drops My
    Districts back off. (The KYC tier is cycled from the profile's **Validate ID** button.)
- **Jurisdiction selector** (centre): opens the subscribed-jurisdiction list. Each row has two
  distinct actions:
  - **Tap the name** → switch to **only** that jurisdiction (deselects all others), open its
    **Feed** (FAB becomes the compose/quill post button), and close the dropdown.
  - **Tap the checkbox** (✓, shown only when the list has **more than one** jurisdiction) → toggle
    whether that jurisdiction is **included in the unified feed** (multi-select filter). At least one
    jurisdiction is always selected — you can't uncheck the last one, so the feed is never empty.

  With a single jurisdiction the checkboxes are hidden entirely. The pill label reflects the filter
  (a single name, or "N selected"). Each row also has an external-open glyph that **opens that
  jurisdiction's page**: it selects **only** that jurisdiction and leaves the Feed (so the FAB swaps
  to its "go to Feed" icon). Below the list: a full-width
  **+ Add Jurisdiction** button. The subscribed list is **saved to a cookie for cross-session
  memory** — it works for a logged-out public user, no account required (**Global** is the default
  entry).
- **Add Jurisdiction** (Spotlight modal): a search field plus a single fixed result, **Alberta**,
  marked with a government-building icon (the only jurisdiction reachable at launch). Selecting it
  appends Alberta to the subscribed list.
- **Login / profile** (top-right): a **person** icon when logged out; when logged in it becomes the
  **"AM" initials avatar** (matching the profile-modal header).
  Flow: tap while logged out to open the **register / login chooser** (a centered card — not a
  full-screen sheet — with **Register** and **Log in** buttons that span the card, plus a
  **Recover account** link). The two buttons branch into the real auth flow:
  - **Register** → a near-full-screen **registration form** mirroring what the API actually
    collects: public profile (**display name**, **handle**), private KYC details (**first / last
    name**, **email**), and a Canadian **address** (street, unit, city, province, postal code,
    country — used only to derive your districts, never shown publicly). The age gate is an
    **"I am 18 or older"** yes/no flag — there is **no date-of-birth field** (the stored DOB is
    being deprecated in favour of an `over_18` boolean). The form ends with a note that a 6-digit
    code will be emailed. Inputs are mock placeholders; **Send Verification Code** assumes valid
    values and (mock-)emails the code.
  - That opens the **verify page** (registration step 2, shown after the email arrives): six **OTP
    code boxes** and a single **Register Passkey** button — tapping it enrolls this device's
    account-login passkey and signs you in (all logins are passkey, so there is no separate
    "log in with passkey" step here). A **Resend** link covers a lost code.
  - The chooser's **Log In** path (returning user) depends on the **OTP-login-allow window** (toggle
    with **O**). Since **all logins are passkey**:
    - **O off** → **Log In logs you in immediately** (assumes a valid passkey on this device) — no
      intermediate modal.
    - **O on** → opens the **login modal** with **OTP code boxes**, a **Verify Email** button, an
      **— or —** divider, and a **Log In With Passkey** button. **Log In With Passkey** signs you in
      directly (skips OTP). **Verify Email** (assumed correct) turns the passkey button into **Register
      Passkey**; tapping that enrols a passkey on this new device, after which the **Log In With
      Passkey** button reappears and the **OTP window closes (O turns off)** — so you finish by logging
      in with the freshly-registered passkey.
    The **Recover account** link (here and on the chooser) routes into the **register/reset flow**
    (reset reuses the register form).

  In the demo, the passkey login resolves to a signed-in session. While logged in, tap the avatar to
  open the **profile modal**, which holds:
  - **Identity verification** widget — current KYC tier badge + a **Validate ID** button (tap to
    cycle Unverified → Identity Verified → Residency Verified for the demo).
  - **Devices & passkeys** widget — a truncated device list with the full count, plus **Add Device**
    (a local passkey) and **Add by Email** (the cross-device OTP flow). Both bump the count here.
  - **Account settings** — a full-width, listed set of items (no separate settings screen):
    **Edit Profile**, **Change Address**, **Privacy Settings** (control which persona/details are
    revealed per jurisdiction or app), **Jurisdictions** (manage the subscribed list), and a
    **Theme** toggle (flips Light ↔ Dark in place — button state only, no page flip). The nav items
    are deferred no-ops; only the Theme toggle is live.
  - A full-width **Log out** button, then the **Terms of Service · Privacy Policy** hyperlinks, and a
    **© copyright** line at the very bottom.

  Every modal (spotlight, chooser, register, login, profile, and the compose-flow modals) has a small
  circular **black ✕ close button** hanging off the card's top-right corner, in addition to Esc /
  tap-outside; their secondary hint lines are prefixed **"Alt:"** to mark them as the alternative
  dismissal.
- **New-post FAB** (bottom-right): quill-on-paper compose icon on the Feed; swaps to a **newspaper**
  ("go to Feed") icon on any other page — including a jurisdiction page opened from the selector's
  external-open glyph — so it acts as "go home". On another page it just returns to the Feed; on the
  Feed it starts a **compose flow** that mirrors the posting rules:
  - **Logged out** → the register / login chooser (you must have an account to post).
  - **Logged in, >1 jurisdiction selected** → a **"Where Do You Want to Post?"** modal to pick which
    of the selected jurisdictions to post in. With exactly **one** selected, that step is skipped and
    the jurisdiction is assumed.
  - Then a **post-type** step listing the **allowed root types for that jurisdiction** (Global allows
    all — Statement / Petition / Poll; Alberta allows Statement + Petition only). If a jurisdiction
    allows just **one** root, this step is skipped too.
  - Finally the **compose modal** (mock editor). At the top, a **Type** label + **Change** button
    (back to the type step; hidden when the jurisdiction allows only one root), then **Posting in**
    with a **jurisdiction dropdown** to change where it posts — but only to jurisdictions that
    **support the current root type** (unsupported ones are **greyed out** with a "type N/A" note).
    The editor body is **type-specific**:
    - **Statement** — Title + Body.
    - **Petition** — Title + Body + a **Support statement** field: the customizable signature-button
      label, defaulting to **"Sign the Petition"**, **60-char** limit (with a live counter). This is a
      *proposed new petition field* — flagged for the doc/API teams in
      [`petition.md`](../docs/entities/civic-content/petition.md) (`[proposed-petition-support-label]`).
    - **Poll** — Question + an **Options** list starting at **2** (Yes/No baseline) with an **Add
      option** control up to the jurisdiction's max (default 10; options past the first two get a
      remove ✕). The list **grows the card up to 5 options, then the 6th+ scroll** inside a fixed
      5-row viewport (mouse wheel; a thumb shows position) — the modal never grows past five. The cap
      is meant to come from per-jurisdiction `contentLimits`, not a hardcoded 10.

    Same Esc / tap-outside / ✕ dismissal as every other modal; the card grows to fit the editor.

### Callout behaviour

Red margin callouts describe the **live state** — the login and FAB labels change wording as you
press **L** / **P**. Callouts for an overlay (the dropdown's checkbox/cookie/external/add notes, the
spotlight modal's notes, and the profile modal's widget notes) only appear **while that overlay is
open**, so the margins stay quiet until the relevant component is visible. The chrome callouts hide
while the full-screen profile sheet is up (it would cover the chrome they point at). **V** toggles
all callouts; the grayscale Shortcut legend stays visible regardless.

## Fork contract (using this as a template)

`mobile/app-frame.svg` is the base every mobile view copies. To make a new view:

1. Copy the file.
2. Keep the `#chrome` group (top bar + FAB), the `#dropdown` / `#modal` groups, and the `<script>`.
3. Replace the contents of the **`#content`** group with your screen's body. That group is the only
   region a view is expected to change; the chrome and its interactions come along for free.

## Conventions

- **Pure wireframe**: grayscale only — `#333` strokes, `#e8e8e8`/`#efefef` placeholder fills,
  `#999`/`#bbb` muted text, system sans font. The FAB is filled dark to read as the primary action.
- **Icons**: Feather (MIT) line icons, inlined once as `<symbol>`s in `<defs>` and reused via
  `<use href="#ic-…">`. JS-built rows (dropdown) reuse the same symbols.
- **Annotations** are the one non-grayscale layer: red (`#c0392b`) callout text + leader arrows in
  the canvas margins, grouped under `#annotations` and toggled by **V**. The shortcut legend is a
  separate grayscale box that stays visible.
