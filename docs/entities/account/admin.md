# admin (platform role)

## Definition

Platform-wide operator role named **`admin`** (not `platform_admin`). Holds the powers that today are exercised by deploy scripts, ops runbooks, and manual database work — and that must become explicit, logged tools over time. Distinct from KYC tiers, the Official role, and the Media mark.

See [GLOSSARY.md](../../GLOSSARY.md) (**admin (role)**) and [01-CONTRIBUTOR-SPEC.md §4.7](../../01-CONTRIBUTOR-SPEC.md).

## Aliases

| Layer | Name |
|-------|------|
| Product | Admin / operator |
| Code (target) | `admin` role on the account |
| Superseded | `platform_admin` |

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
| **Official** | Assign / revoke Official role and seat claim linkage on jurisdiction membership |
| **Media** | Maintain **accreditation body** catalog; grant / revoke Media accreditations (`expires_at` optional) |
| **Jurisdiction config** | Deploy or update gates, recognition lists (`recognizedAccreditationBodyIds`), labels, content limits (today often via `@oursay/jurisdiction-data` + deploy) |
| **Account / ops** | User management, recovery assistance, feature flags, incident response — as already done manually |

Exact UI screens and API shapes for each tool are **not** specified here; this file is the responsibility map.

## Future

- More of the above moves from scripts/SQL into first-class admin tools with the same audit logging.
- Cross-jurisdiction Official **role inheritance** (allowlisted) — see [future.md](./future.md).
- Automated press-credential verification — V2+; still an admin-supervised path if added.

## Unified portal (deferred — out of scope)

A future **unified portal** may serve admins, Officials, Media, and auditors behind one entrypoint. **Do not** invent admin-panel IA, routes, or UX in this pass. If “admin panel” appears in planning, treat it as a **future task** only.

## Gaps

- **[v1-admin-tools]** — replace script/DB-only ops with logged admin APIs/tools for the rows above (incremental).
- Role storage for `admin` on the account — not shipped.
