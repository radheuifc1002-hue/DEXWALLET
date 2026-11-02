import * as bip39 from 'bip39';
import { ethers } from 'ethers';
import * as ed from '@noble/ed25519';
import bs58 from 'bs58';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { assertWalletSession } from './walletSessionService';

export interface WalletAddresses {
  ethereum: string;
  solana: string;
  bnb: string;
  polygon: string;
}

export const generateMnemonic = (): string => bip39.generateMnemonic(128);

export const validateMnemonic = (mnemonic: string): boolean =>
  bip39.validateMnemonic(mnemonic.trim().toLowerCase());

export const deriveAddresses = async (mnemonic: string): Promise<WalletAddresses> => {
  const evmWallet = ethers.Wallet.fromPhrase(mnemonic.trim());
  const evmAddress = evmWallet.address;

  const seed = bip39.mnemonicToSeedSync(mnemonic.trim());
  const solanaSeed = seed.slice(0, 32);
  const solanaPubKey = await ed.getPublicKeyAsync(solanaSeed);
  const solanaAddress = bs58.encode(solanaPubKey);

  return {
    ethereum: evmAddress,
    bnb: evmAddress,
    polygon: evmAddress,
    solana: solanaAddress,
  };
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
  ]);
};


/**
 * Signs an already-reviewed Solana message with the wallet's derived Ed25519
 * key. The mnemonic never leaves native secure storage.
 */
export const signSolanaMessage = async (message: Uint8Array, mnemonic: string): Promise<number[]> => {
  if (!validateMnemonic(mnemonic)) throw new Error('Wallet secret unavailable. Restore wallet.');
  const seed = bip39.mnemonicToSeedSync(mnemonic.trim()).slice(0, 32);
  const signature = await ed.signAsync(message, seed);
  return Array.from(signature);
};
