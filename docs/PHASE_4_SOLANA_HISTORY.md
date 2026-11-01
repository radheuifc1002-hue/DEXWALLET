# Phase 4 — Solana history adapter

## Delivered
- Dedicated `POST /api/solana-history`, separate from EVM history and routed through the central server-side Solana RPC manager.
- Native SOL history derives net wallet lamport movement and removes the successful fee-payer network fee from transfer amount.
- SPL history discovers wallet token accounts for the selected mint, queries wallet and token-account signature streams, de-duplicates signatures and uses independent per-address cursors.
- Historical token-balance attribution uses owner metadata when available and falls back to the discovered token-account pubkey mapped through transaction account keys.
- Amounts use integer arithmetic; malformed raw token amounts are rejected. Lamport values outside JavaScript's safe integer range fail closed rather than silently losing precision.
- Failed transactions are marked as failed and are not presented as successful transfers.
- Signature and transaction requests are bounded to five concurrent requests. SPL token-account discovery is capped at 20 accounts; excess accounts return an explicit error.
- Pagination cursor is opaque, versioned and validated. Cursor positions advance only through signatures consumed for the returned page, preventing skipped records when multiple account streams are merged.
- Asset-detail screen calls `mobile/services/solanaHistory.ts` for both SOL and SPL. The screen no longer makes direct RPC calls.
- Solscan links distinguish mainnet and devnet.

## Semantics and limitations
- One net wallet delta per selected asset per transaction. Instruction-level transfers within the same transaction are collapsed, avoiding intermediate router-hop noise.
- Associated token accounts that have been closed and are no longer returned by `getTokenAccountsByOwner` cannot always be rediscovered from current account state. Full historical coverage for such accounts would require an indexer or another archival account-discovery source, which is intentionally outside this phase.
- Unsupported transaction versions or pruned provider history may be unavailable.
- A token with more than 20 current associated accounts returns a bounded-capacity error rather than silently omitting data.

## Verification
CI runs mobile and backend TypeScript checks, Expo dependency alignment, Solana regression tests, Android JS bundle export and bundle-output verification.

**Live validation status (2026-11-01): BLOCKED by provider configuration.** The Vercel `dexwallet-api` project environment inventory contains no `ALCHEMY_API_KEY`, `ALCHEMY_SOLANA_MAINNET_API_KEY`, `ALCHEMY_SOLANA_TESTNET_API_KEY`, or `RPC_FALLBACK_SOLANA_MAINNET_URL` / `RPC_FALLBACK_SOLANA_TESTNET_URL`. The configured BNB Chainstack URL is not a Solana provider. Consequently the deployed Solana adapter has no configured upstream provider to execute mainnet/devnet requests against. No live-chain result, fallback result, or provider quota/outage result is claimed. Add an approved Solana-capable provider for the Preview environment first, then run native SOL + SPL fixtures on both networks and primary/fallback fault tests. Production environment variables must be set separately after preview verification; no production deployment was performed. APK build is not part of this phase.

The Phase 4 code gates did pass on the previous Phase 4 head: mobile TypeScript, backend TypeScript, Expo dependency alignment, Solana regression tests, Android bundle export and bundle-output verification. The later Phase 5 change is undergoing its own CI.
