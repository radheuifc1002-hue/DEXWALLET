# DEXWALLET Android — Phase 2 Security & Key Management

## Scope
This phase changes Android/Expo app code and mobile CI workflows only. No webapp source, backend service, RPC configuration, or Vercel project configuration was changed.

## Implementation summary

### PIN verification and lockout
- PIN verification is centralized in the wallet service and uses Expo SecureStore for the stored device PIN.
- Failed-attempt counters and the lock deadline are persisted in SecureStore.
- Five consecutive incorrect attempts trigger a 30-second cooldown that survives an app restart.
- Successful verification clears the failed-attempt state.
- The six-digit PIN is not used directly as an encryption key for wallet secrets.

### Scoped authorization
- Added a dedicated wallet security service that issues short-lived, one-use authorization capabilities after successful PIN verification.
- Capabilities are scoped to secret import, account derivation, secret export, or deletion.
- The wallet vault service consumes the authorization before performing protected secret operations.
- A grant cannot be reused or applied to a different operation.

### Recovery phrase and private-key handling
- Removed the recovery phrase from global WalletContext state.
- Added an in-memory wallet session for legacy signing flows. PIN or biometric unlock opens it; app lock and auto-lock revoke it. Direct mnemonic reads used by the send and dapp-browser signing paths now fail while the wallet is locked.
- New and imported recovery phrases are handed between setup screens through Expo SecureStore rather than route parameters.
- Recovery phrase and private-key export are available only for the selected account and require fresh PIN authorization.
- Secret material remains in Expo SecureStore. Wallet names, derivation metadata, and public addresses remain in AsyncStorage.
- Watch-only accounts do not receive private signing material.

### Wallet management
- Importing a recovery phrase or private key requires PIN authorization.
- Creating additional derived accounts requires PIN authorization.
- Removing an account requires PIN authorization and deletes its secret only when no remaining account uses that source.
- Full wallet removal now requests PIN authorization before clearing the vault and legacy wallet storage.
- Creating an empty vault, renaming metadata, and adding watch-only addresses remain non-secret operations.

### Compatibility
- Existing vault metadata version and migration path are preserved.
- The existing wallet migration continues to transfer the legacy recovery phrase into the vault SecureStore entry without requiring the user to re-enter it.
- Existing EVM and legacy Solana derivation behavior is retained.
- The current send flow remains on the original wallet signing path. Selected-account signing for every imported account is Phase 3, not part of this phase.

### CI and APK
- The standalone Android APK workflow now runs on the HD-wallet feature branch.
- The mobile quality workflow also validates the feature branch without merging to main.
- TypeScript validation and the existing mobile regression tests passed on commit `474f6564eff268a1bb2c351d4b8cab542ecbe3b2`.
- Android APK workflow run: `41390244214` (run #181); build and artifact verification are in progress at the time this document was written.

## Storage/security boundary
Expo SecureStore delegates at-rest protection to the platform (Android Keystore-backed encrypted storage and iOS Keychain). This is not a third-party cryptographic audit and does not guarantee protection on a compromised/rooted device or against malicious code running inside the app process.

## Manual test checklist
1. Upgrade-install over the previous APK; confirm the existing wallet address, balances, and history are unchanged.
2. Enter an incorrect PIN five times; restart the app and verify the 30-second lockout persists.
3. Create a new wallet and complete recovery-phrase confirmation and PIN setup.
4. Import a second recovery phrase; verify incorrect PIN blocks the import.
5. Import an EVM private key and a Solana private key; verify incorrect PIN blocks both.
6. Derive additional accounts from a recovery phrase; verify the addresses remain stable after app restart.
7. Export the selected recovery phrase and imported private key; verify PIN is required and the correct source is selected.
8. Attempt export from a watch-only account; confirm no secret is available.
9. Remove one account; confirm other accounts and their secrets remain intact.
10. Attempt full wallet removal with an incorrect PIN, then the correct PIN; confirm removal only succeeds after successful authorization.
11. Verify normal PIN unlock, biometric unlock, auto-lock, balances, transaction history, receive, and existing send behavior.
12. Confirm the APK installs and launches cleanly on the target Android device.

## Release note
This APK is a manual-testing build. Do not use it as evidence of a completed independent security audit or as a production wallet release.
