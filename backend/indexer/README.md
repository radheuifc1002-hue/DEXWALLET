# DEXWALLET Indexer Worker

This is a separate long-running Node.js worker. It must not run as a Vercel request handler.

## Supported indexed-history networks in this slice

- Ethereum mainnet — Blockscout v2
- Ethereum Sepolia — Blockscout v2
- Polygon mainnet — Blockscout v2

Polygon Amoy and BNB Chain remain on the existing device-direct history adapters until a supported indexed provider and quota policy are verified.

## Runtime

Build the container from this directory:

```sh
docker build -t dexwallet-indexer .
docker run --restart unless-stopped \
  -e DATABASE_URL="$DATABASE_URL" \
  -e INDEXER_POLL_INTERVAL_MS=2500 \
  dexwallet-indexer
```

Required environment:
- `DATABASE_URL`: Neon pooled connection string for the indexer role.
- `INDEXER_POLL_INTERVAL_MS`: optional, defaults to 2500 ms.
- `WORKER_ID`: optional stable worker label.

The worker uses an atomic `FOR UPDATE SKIP LOCKED` job claim, stale-lease recovery, idempotent transaction/log upserts, bounded request timeouts, Retry-After handling, exponential retry, and dead-letter status. A crashed worker's running job becomes claimable after five minutes. Each page is a separate job so work remains bounded and restartable.

Do not deploy until the database migration is applied and the worker role has only the permissions it needs. The worker never receives wallet secrets; it indexes public chain addresses only after the app's explicit Indexed Transaction History opt-in.

## Operational notes

- Provider requests are made by this worker, not by the mobile device. Provider quotas and published terms must be respected.
- Only the listed Blockscout networks are enabled. Other chains continue using the mobile's direct provider fallback.
- Logs include job IDs and chain/network but not full wallet addresses.
- Add worker health monitoring, deployment restart policy, and alerting before production traffic.
- This initial worker indexes the first complete history and refreshes recent activity on demand. A scheduled incremental reconciliation and finality/reorg reconciliation are release gates before Phase 2 can be called complete.
