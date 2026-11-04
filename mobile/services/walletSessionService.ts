let walletSessionActive = false;

/** Opens an in-memory unlocked session after PIN or biometric authentication. */
export function openWalletSession(): void {
  walletSessionActive = true;
}

/** Revokes access to legacy signing-secret reads when the app locks. */
export function closeWalletSession(): void {
  walletSessionActive = false;
}

export function assertWalletSession(): void {
  if (!walletSessionActive) throw new Error('Wallet is locked. Unlock it before accessing signing secrets.');
}
