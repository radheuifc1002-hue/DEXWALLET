# DEXWALLET API backend

The independent Vercel project uses this directory as its root. The repository-root `dexwallet` Vercel project also contains API routes and may serve the mobile RPC alias.

## API routes
- `POST /api/rpc?chain=<chain>&network=<network>` — server-side JSON-RPC proxy.
- `GET /api/rpc-health?chain=<chain>&network=<network>` — configured providers and this function instance's circuit state (not an upstream probe).
- `POST /api/history` — stateless EVM asset history via Alchemy Transfers API.
- `POST /api/solana-history` — stateless Solana SOL/SPL history via the central Solana RPC manager.
- `GET /api/health` and `GET /api/ready` — basic health/readiness.

## Solana history request

Send JSON to `/api/solana-history`:
```json
{
  "network": "mainnet",
  "walletAddress": "<base58 address>",
  "isNative": true,
  "limit": 50
}
```

For an SPL token, set `isNative` to `false` and provide `mintAddress`. To continue, pass the returned `nextBefore` signature as `before`. The adapter fetches at most 50 signatures per page and fetches transaction details with a bounded concurrency of five. The response reports `hasMore` and `complete`; consumers should not infer full-history completeness from one page.

## Security and operations

- The API handles public wallet addresses and chain data only.
- Seed phrases, private keys and signing never leave the mobile device.
- Provider credentials and upstream URLs are configured server-side.
- No database, indexer, address-registration system or persistent transaction-history store is required.
- The RPC manager's circuit-breaker state is process-local to each serverless function instance.
- Configure a compatible fallback provider per chain/network before relying on failover.


## Solana history behavior

The Solana history API discovers SPL token accounts for the selected mint and merges wallet/token-account signature streams using a validated opaque per-address cursor. It caps associated token accounts at 20 and uses bounded concurrent RPC requests. Mobile asset-detail history uses the typed `mobile/services/solanaHistory.ts` client. See [Phase 4 documentation](../docs/PHASE_4_SOLANA_HISTORY.md).


## Central RPC gateway

`POST /api/rpc?chain=<chain>&network=<network>` is the mobile JSON-RPC gateway. It accepts an explicit read-only method allowlist and only the signed broadcast methods `eth_sendRawTransaction` and Solana `sendTransaction` as non-replayable writes. Unknown methods and mixed read/write batches are rejected. Read-only calls may fail over to configured compatible providers; signed broadcasts are sent to the primary provider only. Wallet signing and secret storage remain on-device.
