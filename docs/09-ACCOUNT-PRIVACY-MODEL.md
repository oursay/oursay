# OurSay — Account Privacy / Visibility Model (DESIGN TODO — not built)

_Pinned design intent for explicit, multi-level account visibility. **This is a TODO, not a shipped
spec.** Today there is no visibility config; this captures the agreed direction so it isn't lost and
isn't accidentally bolted on as a side effect of unrelated work. Companion to
[`06-PRIVACY-REVIEW.md`](./06-PRIVACY-REVIEW.md) and [`08-IDENTITY-AND-DEVICE-POLICY.md`](./08-IDENTITY-AND-DEVICE-POLICY.md)._

> Status: **deferred.** Next infra step is the block settler / anchoring worker. This document exists
> so the privacy model is designed deliberately later, not inferred from incidental state now.

---

## 1. The decision

**Visibility must be an explicit enum, not inferred from whether a profile handle is null.**

Inferring "private = no handle / public = has handle" overloads one nullable field with semantics it
can't carry (a user may want a display handle *and* be anonymous; or be public with no handle). Null
is for "unset," never for "private." Make the intent a first-class field.

Proposed enum (`account_privacy` / per-jurisdiction `visibility`):

| Value | Meaning |
|---|---|
| `private` / `anonymous` | Identity link hidden; out-of-scope lookups 404 (not 403 — don't confirm existence). |
| `representatives` | Visible to the riding's seated representative views only. |
| `constituents` | Visible to others within the same jurisdiction/riding. |
| `allow_list` | Visible only to an explicit set the user maintains. |
| `public` | Visible to everyone (still only the *anonymized signed record* per 06; this governs the **handle/identity surface**, never the signed civic data itself). |

This governs the **account→identity surface** (handle, profile linkage). It does **not** loosen the
record-privacy invariants in `06-PRIVACY-REVIEW.md`: the signed record stays public and anonymized;
the record→person link stays protected regardless of this setting.

## 2. Where it pins — jurisdiction, with account fallback

The realistic anchor is **per-jurisdiction**, because the same human can rationally be public
municipally and anonymous federally. So:

- **Account-level setting = the default fallback.**
- **Per-jurisdiction override = the authoritative value** when present.

Resolution: `effectiveVisibility(user, jurisdiction) = perJurisdiction[jurisdiction] ?? account.default`.

This mirrors the existing **per-(user, jurisdiction) nullifier root / persona compartmentalization**
in `08` — visibility of a civic identity per jurisdiction is a close cousin of the per-jurisdiction
identity compartmentalization already in the model, and should reuse that jurisdiction key, not invent
a parallel one.

## 3. Out-of-scope reads → 404, not 403

When a viewer is outside the permitted scope, the handle/identity surface must **404 (hide existence)**,
not 403 (confirm-but-deny). Confirming a private account exists is itself a leak.

## 4. Why deferred (scope note)

This is schema-touching (new columns/table for account default + per-jurisdiction overrides) and
read-path-touching (every handle/identity surface gains a scope check) and intersects the
nullifier/persona compartmentalization. It deserves its own design + migration pass, not an
incidental "null = private" shortcut. It is **not** on the golden path — that was blocked only by a
WebAuthn `user.id` length bug (fixed separately), unrelated to handles or privacy.

## 5. When picked up

1. Schema: `account_privacy` default on the user/profile; `(user, jurisdiction) → visibility` override table.
2. Resolver: `effectiveVisibility(user, jurisdiction)` with account fallback.
3. Read-path enforcement on all handle/identity surfaces; 404 on out-of-scope.
4. Reconcile with `06-PRIVACY-REVIEW.md`'s disclosure matrix (these are the *handle* surface; the
   record-disclosure rules there are unchanged).
5. Reuse the `08` jurisdiction key; do not introduce a second jurisdiction taxonomy.
