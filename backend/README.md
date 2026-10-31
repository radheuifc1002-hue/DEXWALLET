# XU Wallet API backend

This directory is the independent Vercel project root. Configure the Vercel project **Root Directory** as `backend`. Vercel builds only this directory; the web wallet and Expo application are outside its deployment root.

## Vercel Functions

Routes:
- `GET /api/health` — process liveness only.
- `GET /api/ready` — database/schema readiness plus a fresh worker heartbeat and all eight configured networks.
- `GET /api/rpc-config` — public RPC endpoint registry.
- `POST /api/indexed-history` — indexed history, maximum 50 rows per page.
- `POST /api/indexer/register-address` — explicit opt-in address enrollment.

Supported indexer targets in this branch:
- Ethereum mainnet and Sepolia
- Polygon mainnet and Amoy testnet (Etherscan API V2, chain ID 80002)
- BNB Smart Chain mainnet and testnet (Etherscan API V2, chain IDs 56 and 97)
- Solana mainnet and devnet (Helius address-history and transfer APIs)


Required Vercel **Production** environment variables:
- `DATABASE_URL` — Neon pooled connection string using the restricted `dexwallet_api` role. Server-side only.
- `API_RATE_LIMIT_SECRET` — independent random secret of at least 32 characters. Server-side only.

Never prefix these secrets with `EXPO_PUBLIC_`. The mobile app must never receive database credentials or rate-limit secrets.

## Persistent indexer worker

The worker is not a Vercel Function. Build the container from the indexer directory:

```sh
docker build -t xu-wallet-indexer ./backend/indexer
```

Run it on an always-on container service with restart-on-failure, health monitoring and logs. Use the restricted `dexwallet_indexer` Neon role for its `DATABASE_URL`.

Required worker environment variables:
- `DATABASE_URL` — Neon pooled connection string for `dexwallet_indexer`.
- `ETHERSCAN_API_KEY` — Etherscan API V2 key for BNB mainnet/testnet and Polygon Amoy transaction and token-transfer history. The worker intentionally fails closed for these networks if it is missing.
- `HELIUS_API_KEY` — Helius key for Solana mainnet/devnet historical transactions and parsed transfers. Helius historical transfer APIs have plan-specific availability and credit costs; verify the account plan before enabling production backfills.

Migration `002_worker_heartbeat.sql` adds the liveness record used by `/api/ready`. The readiness endpoint returns 503 until the worker reports all eight targets: Ethereum mainnet/Sepolia, Polygon mainnet/Amoy, BNB mainnet/testnet and Solana mainnet/devnet.

Do not put worker provider keys in the APK or Vercel function environment unless a specific API function needs them. Provider keys must remain server-side.

## Database

Migration `database/migrations/001_initial_indexer_schema.sql` has been applied to Neon production `main`. New schema changes must first be tested on a temporary Neon branch.

## Release gate

A successful Vercel build is not proof that indexing works. Production readiness additionally requires:
- A successful API deployment and `/api/ready` HTTP 200.
- An always-on worker deployment and confirmed worker heartbeat/job completion.
- Provider credentials and live smoke tests for every enabled chain/network.
- Full history pagination, native/token transfers, contract interactions and case-sensitive Solana address tests.
- Reorg/finality reconciliation, provider failover, monitoring/alerts and backup/restore validation.
- End-to-end APK tests on real Android devices.

Do not enable server-indexed history for a network until its worker adapter and provider credentials are live and verified.
