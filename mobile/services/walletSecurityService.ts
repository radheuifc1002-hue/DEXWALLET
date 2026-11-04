import { verifyPin } from './walletService';

export type WalletSensitiveAction = 'import-secret' | 'derive-account' | 'export-secret' | 'delete-account' | 'sign-transaction';
declare const authorizationBrand: unique symbol;
export type WalletAuthorization = { readonly [authorizationBrand]: true };
const authorizations = new WeakMap<object, { action: WalletSensitiveAction; expiresAt: number }>();
const AUTHORIZATION_TTL_MS = 45_000;

/** PIN verification creates a short-lived, single-use capability for one operation only. */
export async function authorizeWalletAction(pin: string, action: WalletSensitiveAction): Promise<WalletAuthorization | null> {
  if (!(await verifyPin(pin))) return null;
  const authorization = Object.freeze({}) as WalletAuthorization;
  authorizations.set(authorization as object, { action, expiresAt: Date.now() + AUTHORIZATION_TTL_MS });
  return authorization;
}

/** Consume the capability before accessing a secret or performing a destructive operation. */
export function assertWalletAuthorization(authorization: WalletAuthorization, action: WalletSensitiveAction): void {
  if (!authorization || typeof authorization !== 'object') throw new Error('PIN authorization required.');
  const record = authorizations.get(authorization as object);
  authorizations.delete(authorization as object);
  if (!record || record.action !== action || record.expiresAt < Date.now()) {
    throw new Error('Authorization expired or already used. Verify your PIN again.');
  }
}
