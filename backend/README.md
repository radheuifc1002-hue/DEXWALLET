# DEXWALLET API backend

The independent Vercel project uses this directory as its root. The repository-root `dexwallet` Vercel project also contains API routes and may serve the mobile RPC alias.

## API routes
- `POST /api/rpc?chain=<chain>&network=<network>` — server-side JSON-RPC proxy.
- `GET /api/rpc-health?chain=<chain>&network=<network>` — configured provider names and this function instance's circuit state; no upstream probe or secrets.
- `POST /api/history` — generic EVM asset history through the configured server-side Alchemy RPC provider.

## Server-only environment variables
- `ALCHEMY_API_KEY` or `ALCHEMY_<CHAIN>_<NETWORK>_API_KEY` — Alchemy primary.
- `CHAINSTACK_BNB_MAINNET_RPC_URL` — BNB mainnet secondary.
- `RPC_FALLBACK_<CHAIN>_<NETWORK>_URL` — optional HTTPS fallback.

Never prefix credentials with `EXPO_PUBLIC_`. Never embed provider URLs or credentials in the APK.

## Provider failover safety
Alchemy is preferred. Chainstack is the preferred BNB mainnet secondary, followed by a configured generic fallback. Automatic failover is restricted to an explicit allowlist of idempotent read methods. Transaction submission and unknown methods are sent only to the first provider to avoid replaying writes after ambiguous timeouts. Retryable failures include HTTP 408/425/429/5xx, transport failures, invalid JSON and provider capacity/rate-limit errors. Circuit-breaker state is process-local; Vercel instances are independent.

## Data architecture
History is fetched on demand from Alchemy Transfers API. This repository does not run a custom indexer, database-backed job queue, wallet-address registration service, or persistent history database. Wallet secrets and signing remain on-device.
