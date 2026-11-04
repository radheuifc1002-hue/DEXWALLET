# Android Phase 4 — Extensible Chain Adapter Architecture

## Scope and boundaries

Phase 4 completes the Android HD-wallet architecture foundation so additional chains can be added through adapters rather than by rewriting wallet-vault and account-management logic. This is an architecture-enablement phase, not a claim that every future chain is already supported.

Only Android wallet source and Android-focused regression tests are in scope. The webapp, backend, Vercel deployment, RPC configuration, indexers, and transaction-history services are not modified.

## Implemented

### 1. Extensible chain adapter registry

- Added a generic string chain identifier contract while retaining the existing typed four-chain wallet surface.
- The registry can accept future chain adapters without requiring the adapter key to be added to the current WalletChainId union.
- Added getRegisteredChainAdapters() for secret-free capability discovery and diagnostics.
- Added deriveAddressForChain() as the generic derivation entry point.
- Duplicate registrations are rejected. Registered adapters are frozen to prevent runtime mutation.
- Registration validates the coin type range, curve, derivation standard/algorithm, address format, and required derivation methods.

### 2. Versioned derivation metadata

Each existing mnemonic account retains derivation metadata including:
- SLIP-0044 coin type
- elliptic curve
- derivation standard and algorithm
- derivation path
- address format
- scheme version

The vault continues to persist this metadata with account records and backfills metadata when reading older vault records. Existing account addresses are not regenerated or overwritten during metadata migration.

### 3. Derivation path and compatibility rules

- Ethereum, BNB Chain and Polygon share the EVM coin type 60 and the same EVM address for a given account index.
- EVM account path: m/44'/60'/0'/0/{accountIndex}.
- Solana later-account path: m/44'/501'/{accountIndex}'/0' using SLIP-0010 Ed25519 derivation.
- The original Solana account zero remains the legacy first-32-bytes-of-BIP-39-seed derivation. Its address is intentionally not migrated to a new path.
- Account indices are validated as safe, non-negative integers within the supported hardened-index range before path construction or derivation.

### 4. Future chain preparation

The architecture records the planned coin-type assignments:
- Bitcoin: coin type 0
- Tron: coin type 195

These are reserved planning constants only. Bitcoin and Tron are not registered adapters, are not shown as supported chains, and do not gain address derivation, transaction construction, signing, RPC, or UI support from this phase. A future implementation must supply and test its own curve/path, address encoding, private-key format, transaction validation/serialization and signing behavior before enabling the chain.

## Regression coverage

Added tests/phase-4-chain-adapter.test.mjs to check:
1. generic string-keyed adapter registration and registry discovery;
2. duplicate registration and adapter metadata validation;
3. Bitcoin/Tron coin-type planning without falsely enabling either chain;
4. preservation of existing EVM and legacy Solana derivation conventions; and
5. vault persistence/backfill of per-account derivation metadata.

## Validation and release status

Mobile quality gates passed on the Phase 4 implementation and the final index-validation hardening commit: workflow #223 and workflow #224 (push) / #225 (pull request). Application TypeScript, independent backend type-check, and the full repository regression suite passed. The standalone Android APK build is run #193 and is in progress for commit `eb741a60dc73944e3e581a85a1c84b8c2a8edd01`. This does not replace Android device testing, cryptographic vector tests, or an independent security review.

No merge to main is included. The Phase 4 work remains on feature/phase-1-universal-hd-engine.
