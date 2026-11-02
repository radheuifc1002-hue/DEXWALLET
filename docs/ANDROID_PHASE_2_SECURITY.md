# Android Phase 2 — Secure Wallet Storage & Key Management

## Scope

This implementation is limited to the Android/mobile application. No website or webapp source files were changed. The work preserves the existing wallet UI, address derivation conventions, and legacy single-wallet records while strengthening secret access and wallet-management operations.

## Changes

### 1. PIN verification and lockout

- Centralized PIN verification in the wallet service.
- Failed attempts and the temporary lock deadline are persisted in Expo SecureStore, so restarting the app does not reset the throttle.
- Five consecutive invalid attempts trigger a 30-second lock.
- A successful PIN verification clears the failure counter and lock deadline.
- The PIN is used as an authentication credential; it is **not** used directly as an encryption key.

### 2. Short-lived authorization for sensitive actions

- Added a central wallet-security service.
- Successful PIN verification issues an in-memory, action-scoped authorization capability.
- Capabilities expire after 45 seconds and can be consumed only once.
- The vault service checks authorization before importing recovery phrases/private keys, deriving additional accounts, exporting secrets, deleting accounts, or clearing the wallet.
- The authorization capability is not persisted and is not placed in React context or navigation parameters.

### 3. Secret storage and state isolation

- Recovery phrases and imported private keys remain in Expo SecureStore.
- Public wallet metadata, derivation paths, account names, and addresses remain in the vault metadata store.
- Removed the recovery phrase from global WalletContext state.
- New-wallet setup transfers the phrase between setup screens through a temporary SecureStore entry instead of route parameters or global React state. The hand-off is consumed during PIN setup.
- The legacy recovery record is retained for migration/backward compatibility; existing wallet records are not deleted as part of migration.
- No PIN or secret values are intentionally written to application logs.

### 4. Wallet source and account management

- Recovery phrase import requires PIN authorization.
- Private-key import requires PIN authorization.
- Deriving additional accounts from a recovery phrase requires PIN authorization.
- Watch-only address imports remain read-only and do not require secret authorization.
- Account deletion requires explicit confirmation and PIN authorization.
- A source secret is retained while another account still references it; the secret is deleted from SecureStore after its final account reference is removed.
- Full wallet removal from Settings now requires PIN authorization as well.

### 5. Authenticated secret export

- Recovery phrase export is tied to the currently selected mnemonic-backed account and requires PIN authorization.
- Private-key export is available for the selected imported-private-key account and requires PIN authorization.
- Watch-only accounts cannot export a secret because they do not own one.
- Export screens warn users that anyone with the recovery phrase or private key can control the wallet.

### 6. Compatibility

- Existing EVM derivation conventions are retained.
- The existing legacy Solana account-zero derivation path is retained.
- Existing wallet addresses and migration records are preserved.
- This phase does not change RPC configuration, backend APIs, transaction-history services, or the website.

## Validation

- GitHub Actions workflow: **Mobile quality gates**.
- TypeScript application validation: passed.
- Backend API type-check: passed (run as an existing repository quality gate; no backend files were changed).
- Existing RPC and transaction-history regression tests: passed.
- Android standalone APK workflow: initiated for the feature branch. Add the final workflow result and APK artifact reference after the build completes.

## Manual Android test checklist

1. Install the APK over a previous test installation where possible; confirm the existing wallet and addresses remain available.
2. Create a new wallet and confirm the recovery-phrase confirmation and PIN setup complete.
3. Restart the app and confirm the wallet remains available.
4. Enter an incorrect PIN repeatedly; verify the fifth failure starts the temporary lock and a correct PIN works after the lock expires.
5. Export the recovery phrase for the selected mnemonic account; verify an incorrect PIN cannot reveal it.
6. Add a second recovery phrase and confirm the new wallet/account appears without changing the existing address.
7. Derive one account and then a small batch from a selected recovery source; verify the addresses and derivation metadata are retained after restart.
8. Import an EVM private key and a Solana private key; verify the resulting public addresses.
9. Add a watch-only wallet; verify it can be selected but has no signing secret or secret-export option.
10. Export an imported private key after PIN verification; verify a wrong PIN cannot reveal it.
11. Delete one account that shares a recovery source with another account; verify the remaining account still works.
12. Delete the final account using that source; verify its secret is no longer available.
13. Use Settings → Remove Wallet; verify a PIN is required before the wallet is cleared.
14. Confirm wallet balances, transaction history, Send/Receive screens, browser, and lock/unlock behavior remain unchanged.

## Security notes

Expo SecureStore relies on the platform secure-storage implementation (Android Keystore-backed encrypted storage on Android). This change does not add a custom encryption layer or use the six-digit PIN as a key-derivation secret. The authorization layer protects application code paths; it is not a defense against a compromised/rooted device, runtime instrumentation, malicious accessibility services, or a user who exposes their recovery phrase/private key.

This is an engineering implementation awaiting manual device testing and an independent security review. Do not treat the test APK as audited or use it as a guarantee of production security.
