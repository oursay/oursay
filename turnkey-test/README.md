# turnkey-test

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
