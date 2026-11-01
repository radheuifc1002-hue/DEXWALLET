# XU Wallet API backend

The independent Vercel project uses this directory as its root. The repository-root `dexwallet` Vercel project also contains the API routes and currently serves the mobile RPC alias.

## RPC API

- `POST /api/rpc?chain=<chain>&network=<network>` — server-side JSON-RPC proxy.
- `GET /api/rpc-health?chain=<chain>&network=<network>` — reports configured provider names and this function instance's circuit state. It does not probe upstreams and never returns URLs or credentials.

## Server-only environment variables

- `ALCHEMY_API_KEY` or `ALCHEMY_<CHAIN>_<NETWORK>_API_KEY` — Alchemy primary.
- `CHAINSTACK_BNB_MAINNET_RPC_URL` — BNB mainnet secondary.
- `RPC_FALLBACK_<CHAIN>_<NETWORK>_URL` — optional HTTPS fallback for any configured chain/network.
- `DATABASE_URL` and `API_RATE_LIMIT_SECRET` remain for legacy indexer/rate-limit routes until Phase 3.

Never prefix credentials with `EXPO_PUBLIC_`. Never embed provider URLs or credentials in the APK.

## Current Vercel topology and BNB fallback caveat

Two Vercel projects are connected to this repository:
- `dexwallet` (repository root) holds `ALCHEMY_API_KEY` and serves the current mobile API alias.
- `dexwallet-api` (root directory `backend`) holds `CHAINSTACK_BNB_MAINNET_RPC_URL`, `DATABASE_URL`, and `API_RATE_LIMIT_SECRET`.

The Chainstack secret exists on `dexwallet-api`, but Vercel did not return its decrypted value through the environment API, so it could not be copied safely to `dexwallet`. Add the same Chainstack secret to the `dexwallet` project's server-side environment settings before relying on BNB failover. The value is intentionally not in source control.

## Failover safety

Alchemy is preferred. Chainstack is the preferred BNB mainnet secondary, followed by a configured generic fallback. Other chains can use `RPC_FALLBACK_<CHAIN>_<NETWORK>_URL`.

Automatic failover is restricted to an explicit allowlist of idempotent read methods. Transaction submission and unknown methods are sent only to the first provider because replaying writes after an ambiguous timeout can duplicate side effects. Retryable upstream conditions include HTTP 408/425/429/5xx, transport failures, invalid JSON and provider capacity/rate-limit JSON-RPC errors. Jittered delays separate provider attempts.

Circuit-breaker state and latency are process-local. Vercel instances are independent; this is not a globally shared health service. Requests are not globally queued. The health endpoint reports configuration and local circuit state only, not live upstream health.

## Deployment batching

Keep related changes together in one commit. Do not push per-file commits. Defer production deployment until the coordinated release is ready. Git-connected Vercel preview builds can still run for branch updates depending on project settings.
