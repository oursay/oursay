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
  - **Refine** (separate from the type interlock) — a **Verified** value toggle cycling
    **None → ID → Residency** (minimum author verification), and a **My districts** visibility
    toggle shown as an **eye / closed-eye** (open eye = shown, struck-through eye = hidden, with the
    row dimmed when off). These move independently of the record-type selection.
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
- **Login / profile** (top-right): login glyph when logged out, filled avatar when logged in.
  Flow: tap while logged out to open the **register / login modal** (a centered card — not a
  full-screen sheet — with **Register** and **Log in** buttons that span the card, plus a
  **Recover account** link for passkey/OTP recovery; both buttons resolve to a signed-in session in
  the demo). While logged in, tap the avatar to open the **profile modal**, which holds:
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
- **New-post FAB** (bottom-right): quill-on-paper compose icon on the Feed; swaps to a **newspaper**
  ("go to Feed") icon on any other page — including a jurisdiction page opened from the selector's
  external-open glyph — so it acts as "go home".

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
