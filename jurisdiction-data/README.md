# `@oursay/jurisdiction-data`

Registerable per-jurisdiction configuration: gating **rules** (change/revoke, deadlines, signing),
the **privacy** k-anonymity floor, and the **public count-exposure** policy. Each jurisdiction is a
small TypeScript module exporting a `JurisdictionConfig` (the type lives in `@oursay/public-record`);
`index.ts` re-exports them all as `jurisdictions: JurisdictionConfig[]`.

```
jurisdiction-data/
  index.ts                       export const jurisdictions = [oursayGlobal, abCaGov]
  oursay-global/jurisdiction.ts  open sandbox — permissive counts, change/revoke allowed
  ab-ca-gov/jurisdiction.ts      Alberta launch — FINAL-action, tier-gated counts
  ab-ca-gov/districts/           boundary shapefiles (ingested by @oursay/geo, not imported here)
```

## How it's consumed

The API composition root (`api/src/container.ts`) imports `jurisdictions` and registers every entry into
the in-process jurisdiction router (`registerJurisdiction`) during `buildServices`, so all jurisdictions
are live in one process. The deployment's **default** id is still chosen by env (`JURISDICTION_ID`), but
the per-jurisdiction **rules** are authored here — not duplicated in `api/config.ts`.

## Count-exposure policy

`counts: { votes, signatures, minTier? }` drives the `countGating` field on public petition/poll
surfaces (list, detail, `/counts`):

- `votes`/`signatures` `false` ⇒ `countGating: "withheld"` — the scalar is `null` everywhere.
- `true`, no `minTier` ⇒ `countGating: "none"` — exposed (still subject to the k-anonymity floor).
- `true` + non-empty `minTier` ⇒ `countGating: "tier-gated"` — exposed only when the request restricts
  to a tier set ⊆ `minTier` (so list/detail, which never filter by tier, always withhold a gated
  scalar; only `/counts?tier=…` can unlock it).

Reaction tallies are never gated here (they stay publicly visible).

## Public label

Each config may set an optional `label` — the public DISPLAY name surfaced by the area catalog
(`GET /v1/public/jurisdictions`), e.g. `ab-ca-gov` → `"Alberta"`, `oursay-global` → `"OurSay Global"`.
It is display only (never a partition key); when absent, clients fall back to the id.
