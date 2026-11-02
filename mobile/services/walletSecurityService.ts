import { verifyPin } from './walletService';

export type SensitiveScope = 'import' | 'derive' | 'export' | 'delete';
declare const grantBrand: unique symbol;
export type AuthorizationGrant = { readonly [grantBrand]: true };
const grants = new WeakMap<object, { scope: SensitiveScope; expiresAt: number }>();
const GRANT_TTL_MS = 45_000;

export async function authorizeSensitiveAction(pin: string, scope: SensitiveScope): Promise<AuthorizationGrant | null> {
  if (!(await verifyPin(pin))) return null;
  const grant = Object.freeze({}) as AuthorizationGrant;
  grants.set(grant as object, { scope, expiresAt: Date.now() + GRANT_TTL_MS });
  return grant;
}

export function consumeAuthorization(grant: AuthorizationGrant, scope: SensitiveScope): void {
  if (!grant || typeof grant !== 'object') throw new Error('PIN authorization required.');
  const record = grants.get(grant as object);
  grants.delete(grant as object);
  if (!record || record.scope !== scope || record.expiresAt < Date.now()) {
    throw new Error('Authorization expired or already used. Verify your PIN again.');
  }
}
