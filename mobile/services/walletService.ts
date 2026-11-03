import * as bip39 from 'bip39';
import { ethers } from 'ethers';
import * as ed from '@noble/ed25519';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import bs58 from 'bs58';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { assertWalletSession } from './walletSessionService';
import { deriveWalletAddresses, deriveBitcoinAddress } from './chainAdapterRegistry';

export interface WalletAddresses {
  ethereum: string;
  solana: string;
  bnb: string;
  polygon: string;
  arbitrum: string;
  bitcoin: string;
  tron: string;
}

export const generateMnemonic = (): string => bip39.generateMnemonic(128);

export const validateMnemonic = (mnemonic: string): boolean =>
  bip39.validateMnemonic(mnemonic.trim().toLowerCase());

export const deriveAddresses = async (mnemonic: string): Promise<WalletAddresses> => {
  const addresses = await deriveWalletAddresses(mnemonic.trim(), 0);
  return { ...addresses, bitcoinTestnet: await deriveBitcoinAddress(mnemonic.trim(), 0, 'testnet') };
};

const WALLET_ADDRESSES_KEY = 'xu_wallet_addresses';
const WALLET_CREATED_KEY = 'xu_wallet_created';
const PIN_KEY = 'xu_wallet_pin';
const BIOMETRIC_KEY = 'xu_biometric_enabled';
const MNEMONIC_KEY = 'xu_wallet_mnemonic';
const PIN_FAILURES_KEY = 'xu_wallet_pin_failures';
const PIN_LOCK_UNTIL_KEY = 'xu_wallet_pin_lock_until';
const PIN_MAX_FAILURES = 5;
const PIN_LOCK_MS = 30_000;
const PENDING_MNEMONIC_KEY = 'xu_wallet_pending_mnemonic';
const PENDING_WALLET_CONFIG_KEY = 'xu_wallet_pending_config';
const PENDING_PRIVATE_KEY_KEY = 'xu_wallet_pending_private_key';
export type WalletSetupConfig = { name: string; blockchains: ('ethereum'|'bnb'|'polygon'|'arbitrum'|'solana'|'bitcoin'|'tron')[] };
export const stagePendingPrivateKey = async (privateKey: string, blockchain: 'ethereum'|'bnb'|'polygon'|'arbitrum'|'solana'|'bitcoin'|'tron', name: string): Promise<void> => { if (!privateKey.trim()) throw new Error('Private key is required.'); await SecureStore.setItemAsync(PENDING_PRIVATE_KEY_KEY, JSON.stringify({ privateKey: privateKey.trim(), blockchain, name: name.trim() || 'Imported Wallet' })); };
export const consumePendingPrivateKey = async (): Promise<{privateKey:string;blockchain:'ethereum'|'bnb'|'polygon'|'arbitrum'|'solana'|'bitcoin'|'tron';name:string}|null> => { const raw=await SecureStore.getItemAsync(PENDING_PRIVATE_KEY_KEY); await SecureStore.deleteItemAsync(PENDING_PRIVATE_KEY_KEY).catch(()=>{}); if(!raw)return null; try { const v=JSON.parse(raw); return v && typeof v.privateKey==='string' && ['ethereum','bnb','polygon','arbitrum','solana','bitcoin','tron'].includes(v.blockchain) ? v : null; } catch { return null; } };
export const persistPrivateKeyWalletAddresses = async (addresses: Partial<WalletAddresses>): Promise<void> => { const normalized: WalletAddresses={ethereum:addresses.ethereum??'',bnb:addresses.bnb??'',polygon:addresses.polygon??'',arbitrum:addresses.arbitrum??'',solana:addresses.solana??'',bitcoin:addresses.bitcoin??'',bitcoinTestnet:addresses.bitcoinTestnet??'',tron:addresses.tron??''}; await AsyncStorage.setItem(WALLET_ADDRESSES_KEY,JSON.stringify(normalized)); await AsyncStorage.setItem(WALLET_CREATED_KEY,'true'); };
export const stagePendingWalletConfig = async (config: WalletSetupConfig): Promise<void> => { const blockchains = Array.from(new Set(config.blockchains)); if (!blockchains.length || blockchains.some((chain) => !['ethereum','bnb','polygon','arbitrum','solana','bitcoin','tron'].includes(chain))) throw new Error('Select at least one supported blockchain.'); await SecureStore.setItemAsync(PENDING_WALLET_CONFIG_KEY, JSON.stringify({ name: config.name.trim() || 'My Wallet', blockchains })); };
export const consumePendingWalletConfig = async (): Promise<WalletSetupConfig | null> => { const raw = await SecureStore.getItemAsync(PENDING_WALLET_CONFIG_KEY); await SecureStore.deleteItemAsync(PENDING_WALLET_CONFIG_KEY).catch(() => {}); if (!raw) return null; try { const value = JSON.parse(raw) as WalletSetupConfig; return value && Array.isArray(value.blockchains) && value.blockchains.length ? value : null; } catch { return null; } };

/** Temporary setup hand-off kept in platform secure storage, never global React state or route params. */
export const stagePendingMnemonic = async (mnemonic: string): Promise<void> => {
  await SecureStore.setItemAsync(PENDING_MNEMONIC_KEY, mnemonic.trim().toLowerCase().replace(/\s+/g, ' '));
};

export const getPendingMnemonic = async (): Promise<string | null> =>
  SecureStore.getItemAsync(PENDING_MNEMONIC_KEY);

export const consumePendingMnemonic = async (): Promise<string | null> => {
  const mnemonic = await SecureStore.getItemAsync(PENDING_MNEMONIC_KEY);
  await SecureStore.deleteItemAsync(PENDING_MNEMONIC_KEY).catch(() => {});
  return mnemonic;
};

export const saveWalletToStorage = async (
  addresses: WalletAddresses,
  mnemonic: string
): Promise<void> => {
  await AsyncStorage.setItem(WALLET_ADDRESSES_KEY, JSON.stringify(addresses));
  await AsyncStorage.setItem(WALLET_CREATED_KEY, 'true');
  await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic);
};

export const loadWalletFromStorage = async (): Promise<{
  addresses: WalletAddresses | null;
  created: boolean;
  mnemonic: string | null;
}> => {
  const created = (await AsyncStorage.getItem(WALLET_CREATED_KEY)) === 'true';
  const raw = await AsyncStorage.getItem(WALLET_ADDRESSES_KEY);
  const addresses = raw ? (JSON.parse(raw) as WalletAddresses) : null;
  const mnemonic = created ? await SecureStore.getItemAsync(MNEMONIC_KEY) : null;
  return { addresses, created, mnemonic };
};

export const getMnemonic = async (): Promise<string | null> => {
  assertWalletSession();
  return SecureStore.getItemAsync(MNEMONIC_KEY);
};

export const savePin = async (pin: string): Promise<void> => {
  await SecureStore.setItemAsync(PIN_KEY, pin);
  await Promise.all([SecureStore.deleteItemAsync(PIN_FAILURES_KEY).catch(() => {}), SecureStore.deleteItemAsync(PIN_LOCK_UNTIL_KEY).catch(() => {})]);
};

/** Persistent PIN verification throttle; attempts survive app restarts. */
export const verifyPin = async (candidate: string): Promise<boolean> => {
  if (!/^\d{6}$/.test(candidate)) return false;
  const lockRaw = await SecureStore.getItemAsync(PIN_LOCK_UNTIL_KEY);
  const lockUntil = lockRaw ? Number(lockRaw) : 0;
  if (Number.isFinite(lockUntil) && lockUntil > Date.now()) return false;
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  if (!stored) return false;
  if (candidate === stored) {
    await Promise.all([SecureStore.deleteItemAsync(PIN_FAILURES_KEY).catch(() => {}), SecureStore.deleteItemAsync(PIN_LOCK_UNTIL_KEY).catch(() => {})]);
    return true;
  }
  const raw = await SecureStore.getItemAsync(PIN_FAILURES_KEY);
  const failures = Math.max(0, Number(raw) || 0) + 1;
  if (failures >= PIN_MAX_FAILURES) {
    await Promise.all([SecureStore.setItemAsync(PIN_FAILURES_KEY, '0'), SecureStore.setItemAsync(PIN_LOCK_UNTIL_KEY, String(Date.now() + PIN_LOCK_MS))]);
  } else {
    await SecureStore.setItemAsync(PIN_FAILURES_KEY, String(failures));
  }
  return false;
};

export const getBiometricEnabled = async (): Promise<boolean> => {
  const val = await SecureStore.getItemAsync(BIOMETRIC_KEY);
  return val === 'true';
};

export const saveBiometricEnabled = async (enabled: boolean): Promise<void> => {
  await SecureStore.setItemAsync(BIOMETRIC_KEY, String(enabled));
};

export const clearWalletFromStorage = async (): Promise<void> => {
  await Promise.all([
    AsyncStorage.removeItem(WALLET_ADDRESSES_KEY),
    AsyncStorage.removeItem(WALLET_CREATED_KEY),
    SecureStore.deleteItemAsync(PIN_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(PIN_FAILURES_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(PIN_LOCK_UNTIL_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(BIOMETRIC_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(MNEMONIC_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(PENDING_MNEMONIC_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(PENDING_WALLET_CONFIG_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(PENDING_PRIVATE_KEY_KEY).catch(() => {}),
  ]);
};


/**
 * Signs an already-reviewed Solana message with the wallet's derived Ed25519
 * key. The mnemonic never leaves native secure storage.
 */
const deriveSolanaSigningSeed = (mnemonic: string, accountIndex: number): Uint8Array => {
  if (!Number.isInteger(accountIndex) || accountIndex < 0) throw new Error('Invalid Solana account index.');
  const bip39Seed = bip39.mnemonicToSeedSync(mnemonic.trim());
  if (accountIndex === 0) return bip39Seed.slice(0, 32); // Preserve the legacy XU account-zero key.
  const key = new Uint8Array([101, 100, 50, 53, 53, 49, 57, 32, 115, 101, 101, 100]);
  let digest = hmac(sha512, key, bip39Seed);
  let childKey = digest.slice(0, 32);
  let chainCode = digest.slice(32);
  for (const component of [44, 501, accountIndex, 0]) {
    const data = new Uint8Array(37);
    data[0] = 0;
    data.set(childKey, 1);
    new DataView(data.buffer).setUint32(33, (component + 0x80000000) >>> 0, false);
    digest = hmac(sha512, chainCode, data);
    childKey = digest.slice(0, 32);
    chainCode = digest.slice(32);
  }
  return childKey;
};

export const signSolanaMessage = async (message: Uint8Array, mnemonic: string, accountIndex = 0): Promise<number[]> => {
  if (!validateMnemonic(mnemonic)) throw new Error('Wallet secret unavailable. Restore wallet.');
  const signature = await ed.signAsync(message, deriveSolanaSigningSeed(mnemonic, accountIndex));
  return Array.from(signature);
};

export const signSolanaMessageWithPrivateKey = async (message: Uint8Array, privateKey: string): Promise<number[]> => {
  let decoded: Uint8Array;
  try { decoded = bs58.decode(privateKey.trim()); } catch { throw new Error('Stored Solana private key is invalid.'); }
  const seed = decoded.length === 64 ? decoded.slice(0, 32) : decoded;
  if (seed.length !== 32) throw new Error('Stored Solana private key has an unsupported length.');
  return Array.from(await ed.signAsync(message, seed));
};
