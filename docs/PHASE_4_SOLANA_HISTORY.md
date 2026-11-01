# Phase 4 — Solana non-EVM history adapter

**Implementation status: Adapter and typed mobile client added.**  
**Release status: Not production-validated.**

## Delivered

- Added `POST /api/solana-history` as a Solana-specific adapter; Solana parsing is kept separate from EVM/Alchemy transfer logic.
- Routes Solana JSON-RPC through the central server-side RPC manager for mainnet and devnet (the API's `testnet` value maps to devnet).
- Validates wallet and mint addresses, network, cursor and row limit; caps each signature page at 50.
- Fetches transaction details with bounded concurrency (five concurrent reads).
- Derives native SOL movement from the wallet's pre/post lamport balance delta and removes the fee-payer network fee from successful native asset deltas.
- Derives SPL-token movement from pre/post token balances attributed by both selected mint and wallet owner.
- Normalizes direction, amount, timestamp, status, transaction signature and Solscan explorer URL.
- Returns cursor and page metadata (`nextBefore`, `hasMore`, `complete`).
- Added `mobile/services/solanaHistory.ts`, a typed client that calls the backend rather than embedding provider URLs or credentials in the app.
- Documented the route and request shape in `backend/README.md` and updated the infrastructure roadmap.

## Request contract

```json
{
  "network": "mainnet",
  "walletAddress": "<base58 wallet address>",
  "isNative": true,
  "limit": 50
}
```

For SPL history, set `isNative` to `false` and include `mintAddress`. Pass the returned `nextBefore` value as `before` for the next page.

## Safety and resource limits

- Only public wallet/mint data reaches the backend; wallet secrets and signing remain on-device.
- No database, indexer, or persistent history store is introduced.
- The handler has a bounded signature page and transaction-detail concurrency.
- The central RPC manager owns provider credentials, timeout, retry and configured fallback behavior.
- The endpoint returns a generic provider error and request ID rather than exposing upstream URLs or credentials.

## Known limitations / release gates

- Signature discovery currently starts from the wallet address. SPL transactions that involve only one of the wallet's token accounts and do not include the owner wallet in the message may be missed. Full SPL coverage requires token-account discovery and multi-account cursor pagination.
- SPL deltas depend on RPC-provided token-balance owner metadata; rows can be skipped when historical metadata is absent.
- The adapter reports net wallet balance change for a transaction, not each instruction-level transfer. Complex multi-hop swaps and multiple same-mint movements are collapsed to one net row.
- Unsupported transaction versions, pruned historical transaction data, and provider-specific limits can cause transactions to be skipped or a request to fail.
- Live mainnet/devnet fixture tests, pagination tests, provider failover/quota tests and UI integration remain required before production.
- No APK build or production deployment is part of Phase 4.

## Verification

The first Phase 4 CI run exposed a TypeScript inference issue in the mixed native/token row union. The implementation now declares the normalized row type explicitly and uses safe raw-integer parsing for token balance values. The follow-up CI run is the verification gate; this document must not be read as a claim that live chain fixtures or production behavior have been tested.
