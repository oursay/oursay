# turnkey-test

> **Historical / exploratory spike — not the current design.** The identity backbone has moved to
> **passkey auth + level-scoped masters + HKDF per-thread keys (P-256) + per-thread platform
> bindings**. This spike's BIP32/xpub/Turnkey-custody approach was **not adopted**. See
> [`FINDINGS.md`](./FINDINGS.md) for why, and
> [`../public-record/PROPOSAL.md`](../public-record/PROPOSAL.md) §6 for the chosen model. Turnkey
> may remain an *optional recovery* path only.

Experiments for OurSay’s Turnkey integration:

1. Provision a **user sub-organization** (tenant) with a root user and **master HD wallet**.
2. Derive **thread-specific** wallet accounts on a custom BIP32 path.
3. **Sign** a platform binding payload and **identify the user** from response metadata (`organizationId`, `walletId`, `path`, `publicKey`, `address`).

## Run

From the repo root (uses `../.env` or `../*.key.json` by default):

```bash
npm install
npm run test:api --workspace turnkey-test
```

To continue against an existing sub-org (skip provisioning):

```bash
# PowerShell
$env:TURNKEY_RESUME_SUB_ORG_ID="your-sub-org-uuid"
npm run test:api --workspace turnkey-test
```

Credentials are never printed. Only IDs, paths, and addresses are logged.
