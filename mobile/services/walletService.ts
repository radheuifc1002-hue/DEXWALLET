import * as bip39 from 'bip39';
import { ethers } from 'ethers';
import * as ed from '@noble/ed25519';
import bs58 from 'bs58';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

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

export const getMnemonic = async (): Promise<string | null> =>
  SecureStore.getItemAsync(MNEMONIC_KEY);

export const savePin = async (pin: string): Promise<void> => {
  await SecureStore.setItemAsync(PIN_KEY, pin);
};

export const getPin = async (): Promise<string | null> =>
  SecureStore.getItemAsync(PIN_KEY);

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
    SecureStore.deleteItemAsync(BIOMETRIC_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(MNEMONIC_KEY).catch(() => {}),
  ]);
};
