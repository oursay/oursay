# OurSay — Account Privacy / Visibility Model (SPECIFIED — demo-proven, backend pending)

_The explicit, multi-level author-visibility model. **Specified and demonstrated end-to-end in the
Phase D `web-app`** (`web-app/src/lib/types/visibility.ts`, `lib/read-model/visibility.ts`,
`lib/api/identity.ts`); the backend schema and read-path enforcement are pending
(`.agents/WEB-APP-ALIGNMENT-PROMPTS.md` → `[align-w3-gates-schema]` / `[align-w4-api-surface]`).
Companion to [`06-PRIVACY-REVIEW.md`](./06-PRIVACY-REVIEW.md) and
[`08-IDENTITY-AND-DEVICE-POLICY.md`](./08-IDENTITY-AND-DEVICE-POLICY.md)._

---

## 1. The decision

**Visibility is an explicit enum, never inferred from nullable fields.** `handle` and
`display_name` are **required** at registration ([user.md](entities/account/user.md)) — privacy is
a setting, not a missing handle. Null is for "unset," never for "private."

The enum (account default + per-thread override), **most private first**:

| Value | Who may see the identity (name/handle/profile link) behind the author |
|---|---|
| `anonymous` | No one — always a per-thread persona. **The floor and the registration default.** |
| `my_officials` | Only the seated official(s) of the author's own district(s) and/or jurisdiction(s). |
| `all_officials` | Any verified official. |
| `my_district` | Residency-verified members sharing one of the author's districts. |
| `my_jurisdiction` | Residency-verified members of the author's jurisdiction. |
| `id_verified` | Any identity-verified member. |
| `public` | Everyone. |

The selectable set in the picker is a curated subset (`anonymous · all_officials · my_district ·
public` today, per the web-app's `VISIBILITY_VALUES`); the full enum is the wire/domain model.

This governs the **account→identity surface** (handle, display name, profile linkage, avatar
seed). It does **not** loosen the record-privacy invariants in `06-PRIVACY-REVIEW.md`: the signed
civic data — record body, tallies, verification-tier pill, the thread's public stake, the
[`authorGeo` relation](REGION-MODEL.md) — stays public and anonymized regardless. Those are civic
signals, not identity.

## 2. Where it pins — thread wins outright

```
effectiveVisibility = thread ?? account ?? anonymous
```

- **Account-level** setting is the default. New accounts default to **`anonymous`**.
- **Thread-level** override, set when composing or replying in that thread, **wins outright in
  either direction — it may narrow _or widen_**. Widening is a deliberate, per-thread act behind a
  warning dialog (the web-app's anonymity picker + confirmation popup): an anonymous-by-default
  member can stand publicly behind one statement; a public member can go anonymous for one
  sensitive thread. The account value is a default, not a ceiling.
- Absent everything, the floor is **`anonymous`**.
- A **per-jurisdiction** override (`account ⇒ jurisdiction ⇒ thread` middle layer) is a planned
  optional extension — schema should leave room for it, but it is not in the MVP cascade and has
  no UI yet. It would reuse the `08` per-(user, jurisdiction) key, never a parallel taxonomy.

> **Scope note:** this replaces the earlier narrow-only cascade
> (`thread ?? jurisdiction ?? account ?? anonymous`, thread-cannot-widen). The *audience* invariant
> in [entity-rules.md](entities/partitioning/entity-rules.md) — a thread's **geographic audience**
> may narrow but never widen — is a different rule and still holds.

### Personas are the anonymous mirror

When the viewer is outside the effective visibility, the author renders as their stable
**per-thread persona** — same persona everywhere within one thread, a different one in every other
thread, with a globally-unique **persona display name** and a thread-scoped persona page (the
anonymous mirror of a profile: tier pill, support bar, that thread's comments/activity/mentions,
nothing derivable cross-thread). See
[thread-persona.md](entities/civic-identity/thread-persona.md).

### Relationship to the reveal model

The per-thread override governs a thread's visibility **going forward from compose time**. The
**reveal** flow (replacing the old `thread_keys.claimed` / `claimed_at` columns) is the
*retroactive* act — changing the visibility of an existing thread's persona after the fact: a
**platform reveal** is reversible (off-ledger); an **on-chain reveal** is nuclear (permanent). See
[`entities/civic-identity/future.md`](./entities/civic-identity/future.md).

## 3. Out-of-scope reads → 404, not 403

When a viewer is outside the permitted scope, the **entire identity surface** must **404 (hide
existence)**, not 403 (confirm-but-deny):

- `GET /v1/public/profiles/{handle}` — the whole profile (header, posts, activity, mentions), not
  just the handle lookup;
- any resolution from a persona toward its owning handle/profile;
- self is always in scope for self (with a "seen by others as `<persona>`" hint when the effective
  visibility is not `public`).

Confirming a private account exists is itself a leak.

## 4. Implementation map (backend pending)

1. **Schema** (`[align-w3-gates-schema]`): `auth.profiles.visibility` (enum, default
   `'anonymous'`); per-thread override on `thread_bindings.visibility` (private side of the join);
   optional `auth.visibility_overrides (user, jurisdiction)` table reserved for the future middle
   layer; `thread_keys.persona_name`; retire `thread_keys.claimed`/`claimed_at` in favour of the
   reveal model.
2. **Resolver**: `effectiveVisibility = thread ?? account ?? anonymous`; thread override wins
   outright (no widen-rejection); the web-app's `isRevealed(visibility, authorDistricts, viewer)`
   semantics move server-side (`[align-w4-api-surface]`).
3. **Read-path enforcement** on every identity surface; 404 out-of-scope; viewer-resolved
   `identity` objects on DTOs (persona or revealed handle — raw handles never serialized for
   out-of-scope viewers).
4. Reconcile with `06-PRIVACY-REVIEW.md`'s disclosure matrix (this is the *handle/identity*
   surface; the record-disclosure rules are unchanged).
