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

Enum (`account_privacy` / per-jurisdiction `visibility`):

| Value | Meaning |
|---|---|
| `anonymous` | Identity link hidden; out-of-scope lookups 404 (not 403 — don't confirm existence). |
| `my_district` | Visible to others within the viewer's/subject's shared district (riding). |
| `officials` | Visible to the riding's seated representative / official views only. |
| `public` | Visible to everyone (still only the *anonymized signed record* per 06; this governs the **handle/identity surface**, never the signed civic data itself). |

This governs the **account→identity surface** (handle, profile linkage). It does **not** loosen the
record-privacy invariants in `06-PRIVACY-REVIEW.md`: the signed record stays public and anonymized;
the record→person link stays protected regardless of this setting.

## 2. Where it pins — a cascade, narrowest wins

The same human can rationally be public municipally and anonymous federally, and may want a single
thread tighter than their jurisdiction default. So visibility resolves as a **cascade**, with the most
specific set value winning and `anonymous` as the safe floor:

```
effectiveVisibility = thread ?? jurisdiction ?? account ?? anonymous
```

- **Thread-level** override is authoritative when set, but **a thread can only narrow, never widen** —
  it cannot make an account more visible than its jurisdiction/account default allows.
- **Per-jurisdiction** override is next.
- **Account-level** setting is the default fallback.
- Absent everything, the floor is **`anonymous`**.

This mirrors the existing **per-(user, jurisdiction) nullifier root / persona compartmentalization**
in `08`, and the per-thread persona (Pₜ) compartmentalization — visibility is a close cousin and
should reuse those keys, not invent a parallel taxonomy.

### Relationship to the reveal model

Making a persona's identity *more* visible than `anonymous` is the **reveal** flow (replacing the old
`thread_keys.claimed` / `claimed_at` columns): a **platform reveal** is reversible (off-ledger); an
**on-chain reveal** is nuclear (permanent). The cascade above governs who *may* see a revealed link;
reveal is the act that creates the link in the first place. See
[`entities/civic-identity/future.md`](./entities/civic-identity/future.md).

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

1. Schema: `account_privacy` default on the user/profile; `(user, jurisdiction) → visibility` override table; optional `(user, thread)` override (narrow-only). Retire `thread_keys.claimed` / `claimed_at` in favour of the reveal model.
2. Resolver: `effectiveVisibility = thread ?? jurisdiction ?? account ?? anonymous`; reject thread overrides that would widen.
3. Read-path enforcement on all handle/identity surfaces; 404 on out-of-scope.
4. Reconcile with `06-PRIVACY-REVIEW.md`'s disclosure matrix (these are the *handle* surface; the
   record-disclosure rules there are unchanged).
5. Reuse the `08` jurisdiction key; do not introduce a second jurisdiction taxonomy.

> Code-alignment prompt: `.agents/CODE-ALIGNMENT-PROMPTS.md` → `[code-privacy-schema]`.
