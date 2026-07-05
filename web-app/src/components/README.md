# OurSay component library (Phase D2)

Presentational React components that implement the mobile wireframe's chrome and
content patterns in full colour, responsive layout, and accessible markup. They
consume typed props from the D1 layer ([`../lib/types`](../lib/types)); they do
**not** fetch data, route, or perform auth. Parents supply data and stub
callbacks. Visual QA lives at the `/components` gallery route.

## Folder map

| Folder | Contents |
|--------|----------|
| `ui/` | Shared primitives: `Modal`, `Button`, `Avatar`, `NoticeBox`, `CheckboxRow`, `CollapsibleSection` |
| `layout/` | Mobile shell: `AppHeader`, `ScrollBody`, `SafeFooter`, `Fab` |
| `identity/` | `VerificationPill`, `AuthorRow` |
| `content/` | `FeedCard`, `ScopeTag`, `ReactionButtons`, `PetitionProgress`, `PollOptions`, `CommentThread`, `EditCountLink`, `RecordTypeSection`, record-type icon/label maps |
| `chrome/` | Modals & dropdowns: `FilterDropdown`, `JurisdictionSelector`, `AuthChooser`, `RegisterForm`, `OtpVerify`, `LoginChooser`, `ProfileModal`, `ComposeFlow`, `SignModal`, `AddJurisdictionModal` |
| `utils/` | Pure helpers: `initials`, `formatCount` |

Each folder has a barrel `index.ts`; the top-level [`index.ts`](index.ts)
re-exports everything.

## Prop conventions

- **Data props** use D1 types (`FeedItem`, `RecordDetail`, `CommentNode`,
  `ViewerContext`, `VerificationTier`, `JurisdictionMembership`, …).
- **Callbacks** are `onX` stubs (`() => void`, or typed like
  `onReact: (dir: "up" | "down") => void`). No `fetch`, cookies, or WebAuthn.
- **Controlled state** (modal `open`, filter selections, `expanded`, selected
  reaction/vote) is owned by the parent. The gallery drives it with `useState`.
- **Viewer context** is passed explicitly so components can thin social counts.
  Author residence is never computed client-side: the API serves the
  viewer-relative `authorGeo` relation (a member's raw districts stay
  server-side).
- **Timestamps** take `now: Date` and format via `relTime` (gallery uses the
  deterministic mock `NOW`).
- Components are named in `PascalCase`; interactive ones are `"use client"`.

## Domain rules encoded here

- **Verification tier 0 renders nothing** — `VerificationPill` returns `null` for
  public/unverified authors. Tiers 1–3 show a glyph + label and darken with tier.
- **Residency glyph ladder** — a residency author's (tier 2) pill refines by the
  server-resolved `authorGeo` relation: `map-pin-house` (viewer's own district,
  needs a residency-verified viewer) > `map-pin-check` (in the post's affected
  area) > `map-pinned` (in the post's jurisdiction, outside the affected area) >
  `map-pin`. Raw districts never reach the client.
- **Inclusive Verified filter** — `FilterDropdown` cycles the ladder
  Any → Identity → Residency → Official (`tier >= selected`). My Districts needs
  a residency-verified viewer; Affected (post pages) and My Jurisdiction(s)
  (author-residence, all list scopes) are viewer-independent. An engaged
  geography "Only" pins the effective Verified floor to Residency.
- **Social vs civic counts** — social counts (comments, reactions) thin as the
  Verified filter rises (`scaleSocial`); civic counts (signatures, votes) never
  thin — instead an additive "+N unverified" note appears (`civicExtra`).
- **Scope tag expansion** — a multi-district tag shows `Jur · District1 +N`
  collapsed and expands in place to a comma-separated list ending in "See Less".
- **Comment depth** — `CommentThread` nests to `COMMENT_MAX_DEPTH` (3); a reply
  beyond that flattens to a sibling seeded with the replyee's leading `@handle`.

## Stubbed / owned by later phases

- Routing between records/profiles/jurisdictions — Phase D3 (callbacks are stubs).
- Real authentication, passkeys (WebAuthn), OTP delivery, cookies.
- Edit-history timeline — `EditCountLink` exposes the affordance only.
- Comment geography filtering — the parent pre-filters via `geographyKeep`;
  `CommentThread` renders whatever tree it receives.
