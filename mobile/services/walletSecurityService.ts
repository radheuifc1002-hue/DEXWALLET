import { verifyPin } from './walletService';
export type WalletSensitiveAction = 'import-secret' | 'derive-account' | 'export-secret' | 'delete-account';
export type WalletAuthorization = object & { readonly __walletAuthorization: unique symbol };
const grants = new WeakMap<object, { action: WalletSensitiveAction; expiresAt: number }>();
const GRANT_TTL_MS = 60_000;
export async function authorizeWalletAction(pin: string, action: WalletSensitiveAction): Promise<WalletAuthorization | null> {
  if (!(await verifyPin(pin))) return null;
  const grant = Object.freeze({}); grants.set(grant, { action, expiresAt: Date.now() + GRANT_TTL_MS });
  return grant as WalletAuthorization;
}
export function assertWalletAuthorization(grant: WalletAuthorization, action: WalletSensitiveAction): void {
  if (!grant || typeof grant !== 'object') throw new Error('Authorization required. Verify your PIN and try again.');
  const record = grants.get(grant); grants.delete(grant);
  if (!record || record.action !== action || record.expiresAt < Date.now()) throw new Error('Authorization expired or does not permit this action. Verify your PIN again.');
}
