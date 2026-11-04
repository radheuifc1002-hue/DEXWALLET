# Android Phase 3 — Selected-Account Transaction Signing

## Scope

Android application only. This phase extends transaction signing to the selected wallet account while preserving the existing wallet UI, network/RPC routing, transaction preparation, fee estimation, and legacy account-zero derivation. No webapp, backend, Vercel configuration, RPC configuration, or transaction-history service changes are included.

## Implementation

- Recovery-phrase accounts sign with their own account index rather than always using EVM account zero.
  - EVM signing derives `m/44'/60'/0'/0/{accountIndex}`.
  - Solana account zero retains the legacy first-32-bytes-of-BIP39-seed key.
  - Later Solana accounts sign using the same SLIP-0010 path used by the chain adapter registry: `m/44'/501'/{accountIndex}'/0'`.
- Imported EVM private-key accounts can sign on the chain recorded by their source metadata.
- Imported Solana private-key accounts can sign using the stored base58 32-byte seed or 64-byte secret-key format.
- Each signing operation requires the existing one-use `sign-transaction` PIN authorization before the secret is read.
- The selected signing key is checked against the selected account's public address before broadcast. A mismatched key, chain, or account is rejected.
- Watch-only accounts remain unable to prepare or sign a transaction.
- Existing native, ERC-20, SPL Token / Token-2022 transfer preparation, gas/fee estimation, review, nonce/blockhash expiry checks, and broadcast verification remain in the Send flow.
- The Send route continues to use the active wallet address supplied by WalletContext, so account switching changes the sender address used for balances, fee estimation, and transaction construction.

## Compatibility and exclusions

- No existing derivation path or stored wallet address is rewritten.
- Legacy Solana account-zero derivation is explicitly preserved.
- This phase does not add chains, alter chain adapter registration, or implement Bitcoin/Tron.
- DApp/browser signing is not expanded in this phase; this work covers the native Send transaction flow.
- No secrets are placed in route parameters, React context, or logs.

## Validation

Automated validation passed in Mobile quality gates workflow run #211 on implementation commit `92b16f43f690b00bed33ca5ac769ae5212433c97`: application TypeScript validation, backend API type-check (existing repository gate; no backend files changed), and all 43 regression tests passed. Do not treat this as a substitute for manual device testing or an independent security review. An Android release APK has not yet been built for this Phase 3 change.

## Manual Android test checklist

1. Select the original recovery phrase account and verify existing account-zero EVM and legacy Solana transfers still work.
2. Derive a second recovery account, select it, and verify its EVM address is the transaction sender on Ethereum, BNB Chain, and Polygon.
3. Select the same derived account on Solana and verify the derived SLIP-0010 address is the transaction sender.
4. Import an EVM private key for each supported EVM network and verify it can send native coin and ERC-20 tokens only on its recorded chain.
5. Import a Solana private key and verify native SOL and SPL token sends use that key.
6. Attempt to sign after switching accounts between review and confirmation; verify mismatched key/address validation blocks broadcast.
7. Verify a wrong PIN, expired authorization, or cancelled PIN prompt never signs or broadcasts.
8. Verify watch-only accounts cannot prepare or send transactions.
9. Verify balances and transaction history show the currently selected account after switching accounts.
10. Confirm native and token transfer fee estimates, insufficient-balance checks, transaction hashes, and confirmation states.
11. Reinstall/update over the Phase 2 test APK and verify all existing wallet addresses and recovery data remain available.
