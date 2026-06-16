# Deployments

The public registry of production build hashes for OurSay. Every production deployment
publishes a verifiable hash of its build here **and** anchors that hash to external public
infrastructure, so anyone can reproduce the published source and confirm the deployed
application is running the published code, unmodified.

See [`docs/01-CONTRIBUTOR-SPEC.md`](docs/01-CONTRIBUTOR-SPEC.md) §3.5 and §12.2 for the build-
verification requirement, and [`docs/PHILOSOPHY.md`](docs/PHILOSOPHY.md) §8 for the conventions.

> **Status: pre-launch.** No production deployments yet. The first entry is added when OurSay
> first deploys to production.

## How to verify a deployment

1. Check out the commit / tag recorded in the table below.
2. Reproduce the build (`npm ci && npm run build --workspace <workspace>`).
3. Compute the build hash with the documented procedure (to be defined with the first release).
4. Confirm it matches the **Build hash** column **and** the externally-anchored value.

## Deployment log

| Date | Workspace | Commit / tag | Build hash | Anchor reference |
|------|-----------|--------------|------------|------------------|
| _—_  | _—_       | _—_          | _—_        | _—_              |

_No deployments recorded yet._
