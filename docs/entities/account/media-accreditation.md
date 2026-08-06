# Media accreditation

## Definition

A **user-held credential** linking a profile to an **accreditation body** in the platform catalog ([accreditation-body.md](./accreditation-body.md)). While at least one accreditation is **valid**, the account shows the platform-wide **Media mark**. Jurisdiction-gated Media powers (e.g. poll create where configured) require a valid accreditation whose body is on that jurisdiction’s **`recognizedAccreditationBodyIds`** (OurSay’s recognition list for the deployment — not a government decision).

This is **not** a civic-identity signing credential ([../civic-identity/thread-credential.md](../civic-identity/thread-credential.md)), not a KYC tier, and not a per-jurisdiction “gallery role.”

See [GLOSSARY.md](../../GLOSSARY.md) (**Media accreditation**, **Media mark**, **Media-accredited**).

## Aliases

| Layer | Name |
|-------|------|
| Product | Media accreditation / press credential |
| Code (target) | `MediaAccreditation`, `media_accreditations` |
| Derived signal | **Media mark** (no separate forever-flag column required) |

## Identity

Each accreditation is uniquely identified by `id` (UUID). A user may hold many rows (multiple bodies over time).

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `id` | UUID | yes | no | Row id |
| `user_id` | UUID | yes | no | FK → `users.id` |
| `accreditation_body_id` | string | yes | yes (body name via catalog) | FK → accreditation body catalog |
| `expires_at` | TIMESTAMPTZ | no | partial | **Nullable** — null means no stated expiry |
| `revoked_at` | TIMESTAMPTZ | no | no | Set when `admin` revokes |
| `granted_at` | TIMESTAMPTZ | yes | no | When recorded |
| `granted_by_admin_id` | UUID | yes | no | `admin` who recorded it (V1) |
| `note` | TEXT | no | no | Internal ops note — never public |

### Validity

An accreditation is **valid** when:

1. `revoked_at` is null, **and**
2. `expires_at` is null **or** `expires_at` is still in the future.

### Media mark (derived)

**Present** while the user has **≥1 valid** accreditation whose accreditation body exists in the platform catalog (any status that still resolves for display; prefer active bodies for new grants).

**Absent** when every accreditation is expired or revoked.

The mark is **platform-wide** (visible on the profile / byline in any jurisdiction thread). It does **not** by itself satisfy Media act gates.

### Media-accredited in a jurisdiction

The user is **media-accredited** for jurisdiction `J` when they hold a **currently valid** accreditation with `accreditation_body_id` ∈ `J.recognizedAccreditationBodyIds`.

Used by gate actors such as `{ mediaAccredited: true }` (see [../partitioning/jurisdiction.md](../partitioning/jurisdiction.md)).

## States & lifecycle

```
[granted] ──expires_at passes──► [expired]
[granted] ──admin revokes──────► [revoked]
```

- **Grant / revoke:** **`admin`** only in V1 (manual proof review offline; no Didit / auto doc check).
- Expiry is time-based; no cron required for correctness if validity is evaluated at read/act time from `expires_at`.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User | N:1 | Many accreditations over time |
| AccreditationBody | N:1 | Body must exist in catalog |
| Jurisdiction | indirect | Via body’s presence on `recognizedAccreditationBodyIds` |

## Invariants

- **No journalist→jurisdiction assignment table** and **no** per-jurisdiction gallery role — recognition is body-list + valid credential.
- Media mark ≠ Official role; Media mark ≠ KYC tier; Media mark ≠ `admin`.
- Losing all valid accreditations drops the Media mark and drops media-accredited powers everywhere.
- Removing a body from a jurisdiction’s recognition list drops powers in that jurisdiction even if the accreditation remains valid (mark may remain if another valid body accreditation exists).
- Does **not** change Alberta petition-signature deny rules for official-role holders.

## Permissions

| Action | Who |
|--------|-----|
| Grant / revoke | **`admin`** |
| Read own accreditations | Self |
| See Media mark on others | Public (mark only — not internal notes) |
| Act as media-accredited | Self, when gate + recognition + validity hold |

## Events

- Admin grants accreditation → Media mark may appear; powers appear where OurSay’s recognition list includes that body.
- Expiry or revoke → mark/powers recompute.
- Jurisdiction config changes recognized bodies → powers recompute for that jurisdiction only.

## Examples

**Valid:** Reporter holds accreditation from body `ca-caj-example` with `expires_at` null. Platform shows Media mark. OurSay’s `ab-ca-gov` config lists that body in `recognizedAccreditationBodyIds` and `gates.poll.act` allows media-accredited → reporter may create a poll there (subject to signMin). Same reporter where OurSay does not list that body: Media mark still visible; poll create denied.

**Invalid:** Setting a `media` role flag on the user with no accreditation row. Assigning the user to `ab-ca-gov` as “gallery media” without a body credential. Treating residency verification alone as Media accreditation.

## Implementation

| Layer | Path |
|-------|------|
| Spec | this file |
| Schema | `auth.media_accreditations` in `api/src/schema/auth.sql.ts` |
| Repo | `api/src/repo/media-accreditation.repo.ts` |
| CLI | `npm run admin:media-accreditation -w @oursay/api -- grant\|revoke\|list` |
| Wire | `mediaMark` + `mediaAccredited` on feed/detail/comment/profile DTOs; `accreditationBodyIds` on profile header only (credentials showcase shape) |

## Gaps

- **[v1-media-accreditations]** — ✅ rows + admin CLI + derived Media mark / mediaAccredited wire + `{ mediaAccredited: true }` gate actor + Official OR Media OR platform-admin poll create for `ab-ca-gov`.
- **[v1-media-accreditation-bodies]** — ✅ prerequisite catalog + recognition ids on jurisdiction config.
- V2+ (deferred): automate proof of press credentials via supported document types — **out of scope for V1**.
- Credentials showcase UI visuals (profile `accreditationBodyIds` shape landed; rendering deferred).