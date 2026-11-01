# Phase 5 — Non-EVM adapter contract

The Solana adapter remains separate from EVM RPC and history logic. It uses the central RPC manager for Solana JSON-RPC and returns the same top-level history envelope used by EVM: chain, network, walletAddress, asset, rows, limit, requestId, source and completeness metadata.

Rows retain the existing UI fields for compatibility and add normalized `direction`, `status`, and `asset` fields. The asset envelope exposes a common `type` and `address` pair; the EVM `contractAddress` and Solana `mintAddress` fields remain as compatibility aliases.

Solana-specific behavior remains isolated: SOL balance deltas account for the successful fee-payer fee; SPL deltas aggregate pre/post token balances for the wallet's current token accounts; transaction signature streams use bounded concurrency and opaque per-address cursors.

No indexer or persistent cursor store is introduced. Historical closed token accounts cannot always be rediscovered through current account ownership, and provider-pruned history remains an explicit limitation. The adapter reports pagination with `hasMore` and `complete` rather than claiming a partial page is the entire history.
