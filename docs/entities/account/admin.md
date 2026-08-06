# admin (platform role)

## Definition

Platform-wide operator role named **`admin`** (not `platform_admin`). Holds the powers that today are exercised by deploy scripts, ops runbooks, and manual database work — and that must become explicit, logged tools over time. Distinct from KYC tiers, the Official role, and the Media mark.

See [GLOSSARY.md](../../GLOSSARY.md) (**admin (role)**) and [01-CONTRIBUTOR-SPEC.md §4.7](../../01-CONTRIBUTOR-SPEC.md).

## Aliases

| Layer | Name |
|-------|------|
| Product | Admin / operator |
| Code | `admin` role on `auth.account_roles` |
| Superseded | `platform_admin` |

## Storage + elevation (landed — V1-A)

- **Table:** `auth.account_roles` (`user_id`, `role`, `granted_by_admin_id`, `granted_at`). Orthogonal to KYC and to jurisdiction Official on `auth.jurisdiction_memberships` (do not overload membership with a synthetic `platform` jurisdiction).
- **Wire:** `platformRoles: string[]` on `GET /v1/auth/session`, public profile header, and feed / comment / record-detail author shapes.
- **CLI:** `npm run admin:role -w @oursay/api -- grant|revoke|list` — production requires `OURSAY_ALLOW_PROD_ADMIN=1`. Bootstrap grant may leave `granted_by_admin_id` NULL.
- **Official seats CLI:** `npm run admin:seat -w @oursay/api -- claim|revoke|list` — claim/revoke by seat handle via platform-ops (ops soft-key attestation + platform envelope); jurisdiction taken from the seat row (same prod gate). Optional `--jurisdiction` on list; `--email` on revoke to confirm the current claimant.
- **Platform-ops HTTP:** `POST /v1/platform-ops/prepare` + `POST /v1/platform-ops/submit` (full session + `admin` role). Admin attests the clear request (auth passkey or enrolled ops soft-key); platform signs the record.
- **Ops service account:** seeded/CLI-provisioned user (`oursay_ops` by default) with `admin` + soft key in `auth.ops_signing_keys` (`PLATFORM_OPS_ADMIN_PRIVKEY`).
- **Accreditation-body catalog:** `auth.accreditation_bodies` (`id`, `name`, `status` active\|retired). CLI: `npm run admin:accreditation-body -w @oursay/api -- create|update|retire|activate|list` (same prod gate).
- **Media accreditations:** `auth.media_accreditations` + derived `mediaMark` / `mediaAccredited` on feed/detail/comment DTOs; profile exposes `accreditationBodyIds` (mark inferred). CLI: `npm run admin:media-accreditation -w @oursay/api -- grant|revoke|list`.
- **Dev seed:** `npm run seed -w @oursay/api` grants `admin` to `whyte_public@seed.oursay.dev` and Media accreditation (`ab-leg-gallery`) to `global_public` so Platform + Journalist marks appear in the live corpus.
- **Portal HTTP tools** (`POST /v1/portal/admin/*`) remain future — Phase V1-C.

## Platform mark (web-app)

Rendered on public bylines as the purple **Platform** mark (Lucide globe). Client maps wire `platformRoles` to a narrow `platformRole: "admin" | null` for V1-A.

TODO(marks[]): unify Signed / Platform / Media / KYC into `marks: AuthorMark[]` — see `.agents/plans/V1-ROADMAP.md` Phase V1-A author mark model.

## Hard limits

Administrators **cannot**:

- Alter vote counts, signature totals, or published Results by editing ledger data
- Forge or rewrite verification attestations as if a KYC provider issued them
- Bypass append-only / external-anchor integrity of the public record

All admin actions that change product state must be **logged and auditable**.

## Responsibilities (present intent — V1)

Anything currently done by script or hand against production/demo data is in scope to become an admin capability. At minimum:

| Area | Examples |
|------|----------|
| **Moderation / redaction** | Redact or remove user-facing content that violates guidelines; preserve ledger hashes / audit trail for removed items where the product already requires it |
| **Geography** | Maintain district / boundary roster data for a jurisdiction (ingest, refresh, correct seat metadata) |
| **Official** | Assign / revoke Official role and seat claim linkage via **platform-ops** (`admin:seat` CLI + `POST /v1/platform-ops/prepare|submit`) — admin attests the clear request; platform signs the envelope onto the jurisdiction chain before mutable apply |
| **Media** | Maintain **accreditation body** catalog; grant / revoke Media accreditations (`expires_at` optional) |
| **Jurisdiction config** | Deploy or update gates, recognition lists (`recognizedAccreditationBodyIds`), labels, content limits (today often via `@oursay/jurisdiction-data` + deploy; chain ingest deferred on the platform-ops framework) |
| **Account / ops** | User management, recovery assistance, feature flags, incident response — as already done manually |

Exact UI screens and API shapes for each tool are **not** specified here; this file is the responsibility map. Role storage + CLI elevate landed in V1-A; HTTP admin tools are V1-C.

## Future

- More of the above moves from scripts/SQL into first-class admin tools with the same audit logging.
- Cross-jurisdiction Official **role inheritance** (allowlisted) — see [future.md](./future.md).
- Automated press-credential verification — V2+; still an admin-supervised path if added.

## Unified portal (deferred — out of scope for current coding)

A future **unified portal** is the intended home for role-scoped tools:

| Audience | Portal uses (intent) |
|----------|----------------------|
| **Media** | Hosted-poll analytics & results; early exclusivity access when configured; embeds/exports for *their* items |
| **Officials** | Constituency / affected-thread sentiment and responses |
| **`admin`** | Redaction, user management, role assignment, accreditation-body catalog, Media accreditation grant/revoke, district/roster ops |
| **Auditors** | (optional later) verification / recompute tooling entry |

**Do not** invent portal IA, routes, or UX in the current Media/admin alignment pass. If “admin panel” or “dashboard” appears in planning, prefer **portal** wording and treat UI as a **future task**.

## Gaps

- **[v1-admin-tools]** — HTTP/portal logged admin APIs for the responsibility rows above (V1-C+). Role storage + CLI elevate are done (V1-A).
