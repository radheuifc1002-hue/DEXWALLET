# Phase 4 — Solana history adapter

## Scope delivered
- Dedicated `POST /api/solana-history` API, isolated from EVM history.
- Server-side provider routing through the central RPC manager for mainnet and devnet.
- Native SOL transaction discovery and lamport-delta normalization.
- SPL history discovers the wallet's token accounts for the requested mint, queries signatures for the wallet and each token account, merges and de-duplicates signatures by slot, and maintains an independent pagination cursor for every address.
- Transaction owner attribution uses the RPC owner field when present and falls back to the discovered token-account pubkey mapped through transaction account keys.
- Exact integer arithmetic is used for token amounts. Native lamport values are range-checked before conversion.
- Failed transactions are represented as failed rows; fee-only failed native transactions are not misrepresented as transfers.
- Bounded concurrency: at most five signature queries and five transaction detail queries in flight. SPL discovery is capped at 20 token accounts and fails explicitly above that bound.
- The asset-detail screen now calls `mobile/services/solanaHistory.ts`; no direct Solana provider URL or RPC credential is embedded in that screen.
- The mobile service accepts opaque cursors and preserves the API's `hasMore` / `complete` metadata.

## Pagination contract
The `before` field is an opaque base64url cursor. It contains a version and a per-address signature position. The backend validates its shape and every address/signature before using it. A cursor must be passed back unchanged. A page is complete only when every queried address has been exhausted.

## Response semantics
- One net wallet balance delta per transaction and selected asset.
- A transaction that contains multiple instructions or transfers of the same mint is collapsed into one net row. This deliberately avoids displaying router/intermediate hops as separate user transfers.
- Native SOL amounts include actual net SOL movement with the fee payer fee removed for successful transactions.
- Failed transactions are marked failed; a failed transaction is not counted as a successful asset transfer.
- Solscan URLs use the devnet cluster query for testnet requests.

## Automated verification
The CI workflow runs mobile TypeScript, independent backend TypeScript, Expo dependency alignment, Android JS bundle export and bundle verification. Solana regression tests exercise cursor validation, account-stream pagination, token account attribution and amount/fee edge cases.

## Remaining external release checks
The repository's automated checks cannot prove upstream provider availability. Before a production release, run live mainnet and devnet wallet fixtures, validate provider failover/429/403/5xx and quota behavior, and verify historical transaction retention on the configured RPC providers. No production deployment or APK build is part of Phase 4.
