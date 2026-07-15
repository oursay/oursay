# OurSay — VPS production stack

Bring up the full monorepo on a single VPS with Traefik (HTTPS), the marketing site, the civic web app, the API, and public-record (immudb + PostGIS + settlement worker).

Entry point: [`docker-compose.prod.yml`](../docker-compose.prod.yml) at the repo root. Runbook commands assume a Linux VPS with Docker Engine and the Compose plugin.

## What is exposed

| Public hostname | Service |
|-----------------|---------|
| `oursay.ca`, `www.oursay.ca` | marketing `site` (Astro → nginx) |
| `demo.oursay.ca`, `app.oursay.ca` | civic `web-app` (Next.js) |
| `api.oursay.ca` | `@oursay/api` |

- Traefik publishes **only** host ports **80** and **443**.
- The Traefik dashboard / API is **not** enabled.
- `postgres`, `immudb`, and `worker` have **no host ports** and are not Traefik-routed. They live on the internal `oursay-data` Docker network (`internal: true`). The API joins that network to reach the databases and also joins `oursay-proxy` for Traefik + outbound HTTPS (mailer, KYC, etc.).

## Prerequisites

1. **VPS** with a public IPv4 (and IPv6 if you will use AAAA records).
2. **Docker Engine** + **Compose v2** plugin (`docker compose version`).
3. **Firewall**: allow inbound TCP 22 (SSH), 80, and 443. Do not open Postgres, immudb, or Traefik’s old dashboard port.
4. **DNS** (set **before** the first `prod:up` so Let’s Encrypt HTTP-01 can succeed):

| Name | Type | Value |
|------|------|--------|
| `@` / `oursay.ca` | A (and optional AAAA) | VPS IP |
| `www` | A/AAAA or CNAME → apex | VPS IP / `oursay.ca` |
| `demo` | A/AAAA | VPS IP |
| `app` | A/AAAA | VPS IP |
| `api` | A/AAAA | VPS IP |

Confirm with `dig +short oursay.ca` (and the subdomains) from an external host before continuing.

5. **Git** clone of this repository on the VPS (deploy user with permission to use the Docker socket).

## First-time setup

```bash
cd /path/to/oursay
cp .env.prod.example .env
```

Edit `.env` and set at least:

| Variable | Notes |
|----------|--------|
| `TRAEFIK_ACME_EMAIL` | Real mailbox for Let’s Encrypt notices (**required** — Compose fails closed without it) |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PLATFORM_BINDING_PRIVKEY` | P-256 hex; see comment in `.env.prod.example` |
| `LEDGER_ID` | Stable UUID; generate once and **never change** for this deployment |
| `WEBAUTHN_RP_ID` | `oursay.ca` (covers `demo` + `app`) |
| `WEBAUTHN_ORIGIN` | `https://demo.oursay.ca,https://app.oursay.ca` |
| Mailer / KYC | See [`POSTMARK-OTP-SETUP.md`](./POSTMARK-OTP-SETUP.md) and [`DIDIT-KYC-SETUP.md`](./DIDIT-KYC-SETUP.md) |

Optional: copy additional secrets into `api/.env` / `public-record/.env`; the compose file loads those as optional `env_file` entries for `api` and `worker`.

Install Node only if you want to run `npm run prod:up` helpers; you can also call Docker Compose directly (below). On a fresh clone, `npm ci` at the repo root is only needed for host-side scripts — **images build inside Docker**.

## Bring-up

```bash
# Preferred (waits until healthchecks pass)
npm run prod:up

# Equivalent
docker compose -f docker-compose.prod.yml --env-file .env -p oursay up -d --build --wait --remove-orphans
```

Compose recreates app containers with healthchecks so `up --wait` does not return until `api`, `site`, `web-app`, `postgres`, `immudb`, and `traefik` are healthy. Stateful DB services remain single-instance (stop-then-start on recreate). App services do not publish host ports, so Traefik can shift traffic to healthy backends as soon as Docker reports them ready.

First build can take several minutes (workspace `npm ci` + Next/Astro builds).

## Verify

```bash
curl -fsS https://oursay.ca/healthz
curl -fsS -o /dev/null -w "%{http_code}\n" https://demo.oursay.ca/
curl -fsS -o /dev/null -w "%{http_code}\n" https://app.oursay.ca/
curl -fsS https://api.oursay.ca/healthz
docker compose -f docker-compose.prod.yml -p oursay ps
```

Expect HTTPS (valid Let’s Encrypt certs), `api` `/healthz` with `"db":"ok"`, and no listening sockets on the host for 5432 / immudb.

### First civic write (immudb jurisdiction DBs)

Each jurisdiction is its own immudb database (`ab-ca-gov` → `j_ab_ca_gov`, `oursay-global` → `j_oursay_global`). The **worker** creates them on startup for `WORKER_CHAIN_IDS`; the API also creates `CHAIN_ID` lazily on the first submit.

If posting fails with `503` / `selected db doesn't exists`:

```bash
# Confirm what api/worker actually see
docker compose -f docker-compose.prod.yml -p oursay exec api printenv \
  IMMUDB_PG_HOST IMMUDB_PG_PORT IMMUDB_PG_DATABASE CHAIN_ID LEDGER_ID

docker compose -f docker-compose.prod.yml -p oursay logs worker --tail 80

# Force-create jurisdiction DBs (idempotent)
docker compose -f docker-compose.prod.yml -p oursay exec worker \
  npm run jurisdiction:add -w @oursay/public-record -- ab-ca-gov
docker compose -f docker-compose.prod.yml -p oursay exec worker \
  npm run jurisdiction:add -w @oursay/public-record -- oursay-global
```

Then retry the post.

## Updates

```bash
git pull
npm run prod:up
```

That rebuilds changed images and runs `up -d --build --wait`. **Do not** use `docker compose down -v` on this host — named volumes `oursay_public_record_pg` and `oursay_public_record_immudb` hold the civic/private stores.

## Stop (volumes kept)

```bash
OURSAY_ALLOW_PROD_DOWN=1 npm run prod:down
# or
docker compose -f docker-compose.prod.yml -p oursay down --remove-orphans
```

`npm run prod:down` refuses when `NODE_ENV=production` unless `OURSAY_ALLOW_PROD_DOWN=1`. Stopping containers does **not** delete volumes.

## Logs and ACME

```bash
docker compose -f docker-compose.prod.yml -p oursay logs -f traefik api web-app site worker
```

Certificates are stored in the `oursay_traefik_letsencrypt` volume. Renewal is handled by Traefik. If issuance fails:

1. Confirm DNS points at this VPS and ports 80/443 are reachable from the internet.
2. Check Traefik logs for ACME / rate-limit errors.
3. Ensure `TRAEFIK_ACME_EMAIL` is set in `.env`.
4. If logs say `client version 1.24 is too old` against Docker Engine 29+, Traefik cannot read container labels — use **Traefik ≥ v3.6.1** (compose pins `traefik:v3.6.6`). Then `docker compose … up -d --pull always traefik` (or full `prod:up`).

## Security checklist

- [ ] Only 22/80/443 open on the firewall
- [ ] Traefik dashboard not enabled (compose file omits API/dashboard flags)
- [ ] Postgres / immudb / worker not published and not labeled for Traefik
- [ ] Production secrets only in `.env` (or secrets manager), never committed
- [ ] `LEDGER_ID` stable and shared by api + worker
- [ ] WebAuthn RP ID / origins match the public `demo` + `app` hosts

## Package-level compose (not this stack)

`api/docker-compose.prod.yml` and `public-record/docker-compose.prod.yml` remain for package-scoped `prod:up` / `db:prod:up` (API on host `:8085`, no Traefik). Prefer the **root** file for the full public staging/production VPS.
