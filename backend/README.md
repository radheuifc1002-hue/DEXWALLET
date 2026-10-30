# XU Wallet API backend

This directory is the independent Vercel project root. Configure the Vercel project **Root Directory** as `backend`. Vercel will then build only this directory; the web wallet and Expo application are outside its deployment root.

## Vercel Functions

Routes:
- `GET /api/health` — process liveness only.
- `GET /api/ready` — database/schema readiness.
- `GET /api/rpc-config` — public RPC endpoint registry.
- `POST /api/indexed-history` — cached indexed EVM history (maximum 50 rows).
- `POST /api/indexer/register-address` — explicit opt-in address enrollment.

Required Vercel **Production** environment variables:
- `DATABASE_URL` — Neon pooled connection string. Server-side only.
- `API_RATE_LIMIT_SECRET` — cryptographically random secret of at least 32 characters. Server-side only.

Never prefix these secrets with `EXPO_PUBLIC_`. The mobile app must never receive database credentials or rate-limit secrets.

## Persistent indexer worker

The worker is not a Vercel Function. Build the container with this directory as context:

```sh
docker build -t xu-wallet-indexer ./backend/indexer
```

Run it on an always-on container service with `DATABASE_URL`, restart-on-failure, health monitoring and logs. It requires database permissions limited to the indexer tables.

## Database

Apply `database/migrations/001_initial_indexer_schema.sql` to the intended Neon production branch only after testing the migration on a temporary Neon branch and confirming the schema smoke tests. Do not enable mobile indexed-history opt-in until `/api/ready` is HTTP 200 and an end-to-end address sync has completed.

## Release gate

A successful Vercel build is not proof that indexing works. Production readiness additionally requires database migration, worker deployment, chain-specific provider coverage, reorg/finality reconciliation, monitoring/alerts, backup/restore validation and end-to-end mobile tests.
