import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { ethers } from 'ethers';
import * as bip39 from 'bip39';
import * as ed from '@noble/ed25519';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha2';
import bs58 from 'bs58';
import {
  deriveAddresses,
  loadWalletFromStorage,
  validateMnemonic,
  type WalletAddresses,
} from './walletService';
import type { Blockchain } from '../../context/WalletContext';

const STORE_KEY = 'xu_wallet_vault_store_v1';
const STORE_VERSION = 1;

export type WalletSourceType = 'mnemonic' | 'private-key' | 'watch-only';

export interface WalletKeySource {
  id: string;
  type: 'mnemonic' | 'private-key';
  name: string;
  createdAt: number;
  blockchain?: Blockchain;
}

export interface WalletAccount {
  id: string;
  sourceId: string | null;
  sourceType: WalletSourceType;
  name: string;
  accountIndex: number | null;
  derivationPaths: Partial<Record<Blockchain, string>>;
  addresses: Partial<WalletAddresses>;
  createdAt: number;
}

export interface WalletVault {
  id: string;
  name: string;
  createdAt: number;
  sources: WalletKeySource[];
  accounts: WalletAccount[];
}

export interface WalletVaultStore {
  version: 1;
  activeVaultId: string | null;
  activeAccountId: string | null;
  vaults: WalletVault[];
}

const makeId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const secretKey = (sourceId: string) => `xu_vault_secret_${sourceId}`;

const emptyStore = (): WalletVaultStore => ({
  version: STORE_VERSION,
  activeVaultId: null,
  activeAccountId: null,
  vaults: [],
});

async function persistStore(store: WalletVaultStore): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(store));
}

async function readStore(): Promise<WalletVaultStore | null> {
  const raw = await AsyncStorage.getItem(STORE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WalletVaultStore;
    if (parsed.version !== STORE_VERSION || !Array.isArray(parsed.vaults)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function withActive(store: WalletVaultStore, vaultId: string, accountId: string): WalletVaultStore {
  return { ...store, activeVaultId: vaultId, activeAccountId: accountId };
}

function findVault(store: WalletVaultStore, vaultId: string): WalletVault {
  const vault = store.vaults.find((item) => item.id === vaultId);
  if (!vault) throw new Error('Wallet vault not found.');
  return vault;
}

function accountExists(vault: WalletVault, addresses: Partial<WalletAddresses>): boolean {
  return vault.accounts.some((account) =>
    Object.entries(addresses).some(([chain, address]) => {
      const existing = account.addresses[chain as Blockchain];
      if (!address || !existing) return false;
      return chain === 'solana' ? address === existing : address.toLowerCase() === existing.toLowerCase();
    })
  );
}

/**
 * Migrates the single-wallet installation into a default vault without
 * changing its existing addresses or deleting the legacy recovery record.
 * Mnemonics and private keys are stored only in Expo SecureStore; the vault
 * index in AsyncStorage contains metadata and public addresses only.
 */
export async function initializeWalletVaultStore(): Promise<WalletVaultStore> {
  const existing = await readStore();
  if (existing) return existing;

  const store = emptyStore();
  const legacy = await loadWalletFromStorage();

  if (legacy.created && legacy.addresses) {
    const vaultId = makeId('vault');
    const vault: WalletVault = {
      id: vaultId,
      name: 'My Wallets',
      createdAt: Date.now(),
      sources: [],
      accounts: [],
    };

    if (legacy.mnemonic && validateMnemonic(legacy.mnemonic)) {
      const sourceId = makeId('seed');
      await SecureStore.setItemAsync(secretKey(sourceId), legacy.mnemonic);
      vault.sources.push({
        id: sourceId,
        type: 'mnemonic',
        name: 'Recovery Phrase 1',
        createdAt: Date.now(),
      });
      vault.accounts.push({
        id: makeId('account'),
        sourceId,
        sourceType: 'mnemonic',
        name: 'Main Wallet',
        accountIndex: 0,
        derivationPaths: {
          ethereum: "m/44'/60'/0'/0/0",
          bnb: "m/44'/60'/0'/0/0",
          polygon: "m/44'/60'/0'/0/0",
          // Preserve the existing XU Solana address during migration.
          solana: 'legacy:first-32-bytes-of-bip39-seed',
        },
        addresses: legacy.addresses,
        createdAt: Date.now(),
      });
    } else {
      vault.accounts.push({
        id: makeId('account'),
        sourceId: null,
        sourceType: 'watch-only',
        name: 'Imported Wallet',
        accountIndex: null,
        derivationPaths: {},
        addresses: legacy.addresses,
        createdAt: Date.now(),
      });
    }

    store.vaults.push(vault);
    store.activeVaultId = vault.id;
    store.activeAccountId = vault.accounts[0].id;
  }

  await persistStore(store);
  return store;
}

export async function getWalletVaultStore(): Promise<WalletVaultStore> {
  return (await readStore()) ?? initializeWalletVaultStore();
}

export async function createWalletVault(name = 'New Vault'): Promise<WalletVaultStore> {
  const store = await getWalletVaultStore();
  const vault: WalletVault = {
    id: makeId('vault'),
    name: name.trim() || 'New Vault',
    createdAt: Date.now(),
    sources: [],
    accounts: [],
  };
  const next = { ...store, vaults: [...store.vaults, vault], activeVaultId: vault.id, activeAccountId: null };
  await persistStore(next);
  return next;
}

export async function renameWalletVault(vaultId: string, name: string): Promise<WalletVaultStore> {
  const store = await getWalletVaultStore();
  const clean = name.trim();
  if (!clean) throw new Error('Vault name cannot be empty.');
  const next = {
    ...store,
    vaults: store.vaults.map((vault) => vault.id === vaultId ? { ...vault, name: clean } : vault),
  };
  if (!next.vaults.some((vault) => vault.id === vaultId)) throw new Error('Wallet vault not found.');
  await persistStore(next);
  return next;
}

export async function addMnemonicSource(
  vaultId: string,
  mnemonicInput: string,
  sourceName = 'Recovery Phrase',
  accountName = 'Main Wallet',
): Promise<WalletVaultStore> {
  const mnemonic = mnemonicInput.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(mnemonic)) throw new Error('Invalid recovery phrase.');
  const addresses = await deriveAddresses(mnemonic);
  const store = await getWalletVaultStore();
  const vault = findVault(store, vaultId);
  if (accountExists(vault, addresses)) throw new Error('This wallet is already present in this vault.');

  const sourceId = makeId('seed');
  await SecureStore.setItemAsync(secretKey(sourceId), mnemonic);
  const source: WalletKeySource = {
    id: sourceId,
    type: 'mnemonic',
    name: sourceName.trim() || 'Recovery Phrase',
    createdAt: Date.now(),
  };
  const account: WalletAccount = {
    id: makeId('account'),
    sourceId,
    sourceType: 'mnemonic',
    name: accountName.trim() || 'Main Wallet',
    accountIndex: 0,
    derivationPaths: {
      ethereum: "m/44'/60'/0'/0/0",
      bnb: "m/44'/60'/0'/0/0",
      polygon: "m/44'/60'/0'/0/0",
      solana: 'legacy:first-32-bytes-of-bip39-seed',
    },
    addresses,
    createdAt: Date.now(),
  };
  const nextVault = { ...vault, sources: [...vault.sources, source], accounts: [...vault.accounts, account] };
  const next = {
    ...store,
    vaults: store.vaults.map((item) => item.id === vaultId ? nextVault : item),
    activeVaultId: vaultId,
    activeAccountId: account.id,
  };
  try {
    await persistStore(next);
  } catch (error) {
    await SecureStore.deleteItemAsync(secretKey(sourceId)).catch(() => {});
    throw error;
  }
  return next;
}

async function deriveSolanaAccount(mnemonic: string, accountIndex: number): Promise<string> {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const slip10Key = Uint8Array.from([101, 100, 50, 53, 53, 49, 57, 32, 115, 101, 101, 100]);
  let digest = hmac(sha512, slip10Key, seed);
  let key = digest.slice(0, 32);
  let chainCode = digest.slice(32);

  // SLIP-0010 hardened derivation: m/44'/501'/accountIndex'/0'.
  for (const component of [44, 501, accountIndex, 0]) {
    const data = new Uint8Array(37);
    data[0] = 0;
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, (component + 0x80000000) >>> 0, false);
    digest = hmac(sha512, chainCode, data);
    key = digest.slice(0, 32);
    chainCode = digest.slice(32);
  }

  return bs58.encode(await ed.getPublicKeyAsync(key));
}

async function deriveAccountAddresses(mnemonic: string, accountIndex: number): Promise<WalletAddresses> {
  if (accountIndex === 0) return deriveAddresses(mnemonic);
  const evmPath = `m/44'/60'/0'/0/${accountIndex}`;
  const evmAddress = ethers.HDNodeWallet.fromPhrase(mnemonic, '', evmPath).address;
  const solanaAddress = await deriveSolanaAccount(mnemonic, accountIndex);
  return { ethereum: evmAddress, bnb: evmAddress, polygon: evmAddress, solana: solanaAddress };
}

export async function addDerivedAccount(
  vaultId: string,
  sourceId: string,
  accountName?: string,
): Promise<WalletVaultStore> {
  const store = await getWalletVaultStore();
  const vault = findVault(store, vaultId);
  const source = vault.sources.find((item) => item.id === sourceId);
  if (!source || source.type !== 'mnemonic') throw new Error('Recovery phrase source not found.');
  const mnemonic = await SecureStore.getItemAsync(secretKey(sourceId));
  if (!mnemonic) throw new Error('Recovery phrase is unavailable. Restore this wallet.');
  const indices = vault.accounts
    .filter((account) => account.sourceId === sourceId && account.accountIndex !== null)
    .map((account) => account.accountIndex as number);
  const accountIndex = indices.length ? Math.max(...indices) + 1 : 0;
  const addresses = await deriveAccountAddresses(mnemonic, accountIndex);
  if (accountExists(vault, addresses)) throw new Error('The derived account already exists.');
  const account: WalletAccount = {
    id: makeId('account'),
    sourceId,
    sourceType: 'mnemonic',
    name: accountName?.trim() || `Account ${accountIndex + 1}`,
    accountIndex,
    derivationPaths: {
      ethereum: `m/44'/60'/0'/0/${accountIndex}`,
      bnb: `m/44'/60'/0'/0/${accountIndex}`,
      polygon: `m/44'/60'/0'/0/${accountIndex}`,
      solana: accountIndex === 0 ? 'legacy:first-32-bytes-of-bip39-seed' : `m/44'/501'/${accountIndex}'/0'`,
    },
    addresses,
    createdAt: Date.now(),
  };
  const next = withActive({
    ...store,
    vaults: store.vaults.map((item) => item.id === vaultId ? { ...vault, accounts: [...vault.accounts, account] } : item),
  }, vaultId, account.id);
  await persistStore(next);
  return next;
}

export async function addPrivateKeyAccount(
  vaultId: string,
  blockchain: Blockchain,
  privateKeyInput: string,
  accountName = 'Imported Key',
): Promise<WalletVaultStore> {
  const privateKey = privateKeyInput.trim();
  if (!privateKey) throw new Error('Private key is required.');
  let addresses: Partial<WalletAddresses>;
  if (blockchain === 'solana') {
    const decoded = bs58.decode(privateKey);
    const seed = decoded.length === 64 ? decoded.slice(0, 32) : decoded;
    if (seed.length !== 32) throw new Error('Solana private key must be a 32-byte seed or 64-byte secret key.');
    addresses = { solana: bs58.encode(await ed.getPublicKeyAsync(seed)) };
  } else {
    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const wallet = new ethers.Wallet(normalizedKey);
    addresses = { [blockchain]: wallet.address };
  }

  const store = await getWalletVaultStore();
  const vault = findVault(store, vaultId);
  if (accountExists(vault, addresses)) throw new Error('This address is already present in this vault.');
  const sourceId = makeId('key');
  await SecureStore.setItemAsync(secretKey(sourceId), privateKey);
  const source: WalletKeySource = {
    id: sourceId,
    type: 'private-key',
    name: accountName.trim() || 'Imported Key',
    createdAt: Date.now(),
    blockchain,
  };
  const account: WalletAccount = {
    id: makeId('account'),
    sourceId,
    sourceType: 'private-key',
    name: accountName.trim() || 'Imported Key',
    accountIndex: null,
    derivationPaths: {},
    addresses,
    createdAt: Date.now(),
  };
  const next = withActive({
    ...store,
    vaults: store.vaults.map((item) => item.id === vaultId ? { ...vault, sources: [...vault.sources, source], accounts: [...vault.accounts, account] } : item),
  }, vaultId, account.id);
  try {
    await persistStore(next);
  } catch (error) {
    await SecureStore.deleteItemAsync(secretKey(sourceId)).catch(() => {});
    throw error;
  }
  return next;
}

export async function addWatchOnlyAccount(
  vaultId: string,
  addressesInput: Partial<WalletAddresses>,
  accountName = 'Watch Wallet',
): Promise<WalletVaultStore> {
  const addresses: Partial<WalletAddresses> = {};
  for (const chain of ['ethereum', 'bnb', 'polygon', 'solana'] as Blockchain[]) {
    const value = addressesInput[chain]?.trim();
    if (!value) continue;
    if (chain === 'solana') {
      try {
        if (bs58.decode(value).length !== 32) throw new Error('invalid');
      } catch {
        throw new Error('Invalid Solana public address.');
      }
      addresses.solana = value;
    } else {
      if (!ethers.isAddress(value)) throw new Error(`Invalid ${chain} address.`);
      addresses[chain] = ethers.getAddress(value);
    }
  }
  if (!Object.keys(addresses).length) throw new Error('Enter at least one valid public address.');

  const store = await getWalletVaultStore();
  const vault = findVault(store, vaultId);
  if (accountExists(vault, addresses)) throw new Error('This address is already present in this vault.');
  const account: WalletAccount = {
    id: makeId('account'),
    sourceId: null,
    sourceType: 'watch-only',
    name: accountName.trim() || 'Watch Wallet',
    accountIndex: null,
    derivationPaths: {},
    addresses,
    createdAt: Date.now(),
  };
  const next = withActive({
    ...store,
    vaults: store.vaults.map((item) => item.id === vaultId ? { ...vault, accounts: [...vault.accounts, account] } : item),
  }, vaultId, account.id);
  await persistStore(next);
  return next;
}

export async function renameWalletAccount(
  vaultId: string,
  accountId: string,
  name: string,
): Promise<WalletVaultStore> {
  const clean = name.trim();
  if (!clean) throw new Error('Wallet name cannot be empty.');
  const store = await getWalletVaultStore();
  const vault = findVault(store, vaultId);
  if (!vault.accounts.some((account) => account.id === accountId)) throw new Error('Wallet account not found.');
  const next = {
    ...store,
    vaults: store.vaults.map((item) => item.id === vaultId
      ? { ...item, accounts: item.accounts.map((account) => account.id === accountId ? { ...account, name: clean } : account) }
      : item),
  };
  await persistStore(next);
  return next;
}

export async function setActiveWalletAccount(vaultId: string, accountId: string): Promise<WalletVaultStore> {
  const store = await getWalletVaultStore();
  const vault = findVault(store, vaultId);
  if (!vault.accounts.some((account) => account.id === accountId)) throw new Error('Wallet account not found.');
  const next = withActive(store, vaultId, accountId);
  await persistStore(next);
  return next;
}

export async function removeWalletAccount(vaultId: string, accountId: string): Promise<WalletVaultStore> {
  const store = await getWalletVaultStore();
  const vault = findVault(store, vaultId);
  if (!vault.accounts.some((account) => account.id === accountId)) throw new Error('Wallet account not found.');
  const accounts = vault.accounts.filter((account) => account.id !== accountId);
  const nextVaults = store.vaults.map((item) => item.id === vaultId ? { ...item, accounts } : item);
  const remaining = nextVaults.flatMap((item) => item.accounts);
  const activeAccountId = store.activeAccountId === accountId ? (remaining[0]?.id ?? null) : store.activeAccountId;
  const activeVaultId = store.activeAccountId === accountId ? (remaining[0] ? nextVaults.find((item) => item.accounts.some((a) => a.id === remaining[0].id))?.id ?? null : null) : store.activeVaultId;
  const next = { ...store, vaults: nextVaults, activeVaultId, activeAccountId };
  await persistStore(next);
  return next;
}

export async function clearWalletVaultStore(): Promise<void> {
  const store = await readStore();
  await AsyncStorage.removeItem(STORE_KEY);
  if (!store) return;
  await Promise.all(store.vaults.flatMap((vault) =>
    vault.sources.map((source) => SecureStore.deleteItemAsync(secretKey(source.id)).catch(() => {}))
  ));
}
