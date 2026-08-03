# Accreditation body

## Definition

A **platform-catalog** entry for an organization that **issues press credentials** OurSay may record as Media accreditation — including legislative press galleries, municipal or court press credentials, provincial/federal gallery passes, associations such as CAJ, and similar credential issuers. Users do not “join” an accreditation body as a role; they hold one or more **Media accreditations** that reference a body ([media-accreditation.md](./media-accreditation.md)).

Per-jurisdiction config lists which catalog ids OurSay **chooses to recognize** for Media-gated acts in that jurisdiction (`recognizedAccreditationBodyIds`). That list is **platform policy** for the jurisdiction deployment — not a government decision or partnership.

See [GLOSSARY.md](../../GLOSSARY.md) (**Accreditation body**, **Media accreditation**, **Media mark**, **Media-accredited**).

## Aliases

| Layer | Name |
|-------|------|
| Product | Accreditation body / press credential issuer |
| Code (target) | `AccreditationBody`, `accreditation_bodies` |
| Config | Referenced by id from `JurisdictionConfig.recognizedAccreditationBodyIds` |
| Superseded | “Issuing body” / `IssuingBody` / `recognizedIssuingBodyIds` |

## Identity

Two accreditation bodies are the same if their `id` strings match. Primary key: stable slug/id in the platform catalog.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `id` | string | yes | yes | Stable catalog id (e.g. `ca-caj-example`) |
| `name` | string | yes | yes | Display name |
| `status` | enum | yes | partial | `active` \| `retired` — retired bodies stay referencable for historical accreditations but are not newly grantable |
| `created_at` | TIMESTAMPTZ | yes | no | Catalog row |
| `updated_at` | TIMESTAMPTZ | yes | no | Catalog row |

## States & lifecycle

```
[active] ──admin retires──► [retired]
```

- **Create / update / retire:** **`admin`** only (V1 manual; no self-serve org claim).
- A retired body remains on existing accreditations for audit; new accreditations against it are rejected.
- Jurisdiction config may drop a body from `recognizedAccreditationBodyIds` without retiring the catalog entry.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| MediaAccreditation | 1:N | Accreditations reference `accreditation_body_id` |
| Jurisdiction | N:M (config) | Via `recognizedAccreditationBodyIds` — not a join table of journalists |

## Invariants

- Bodies exist **only** in the platform catalog; jurisdiction config stores **ids**, never free-text body names.
- Catalog membership ≠ Media powers. Powers require a valid accreditation **and** OurSay’s recognition list for that jurisdiction ([media-accreditation.md](./media-accreditation.md)).
- Not a KYC provider, not a civic-identity signing credential, not an Official seat.

## Permissions

| Action | Who |
|--------|-----|
| List active bodies | Public / authenticated (catalog) |
| Create / update / retire | **`admin`** |
| Select for jurisdiction recognition | Platform configuration (`admin` / deploy config) — not end users; not any government |

## Events

- Admin creates or retires a body.
- Jurisdiction config change adds/removes a recognized body id (powers for media-accredited users in that jurisdiction recompute).

## Examples

**Valid:** Catalog entry `id: "ca-caj-example"` listed by OurSay on `ab-ca-gov`’s `recognizedAccreditationBodyIds` (bodies OurSay chooses to treat as typical for that deployment); a reporter with a valid accreditation from that body may satisfy `{ mediaAccredited: true }` on `gates.poll` there.

**Invalid:** Storing `"Calgary Herald"` as a free-text string on the jurisdiction with no catalog id. Assigning a “gallery role” on jurisdiction membership instead of recognizing a body. Copy that says the Government of Alberta “recognizes” bodies on OurSay.

## Implementation

| Layer | Path |
|-------|------|
| Spec | this file |
| Code | **Gap** — no table/API yet (`[v1-media-accreditation-bodies]`) |

## Gaps

- **[v1-media-accreditation-bodies]** — catalog schema, admin tools, jurisdiction `recognizedAccreditationBodyIds` wiring.
- V2+ (deferred): automated verification of press documents / provider-attested credentials — **not** V1.
