import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { ethers } from 'ethers';
import * as ed from '@noble/ed25519';
import bs58 from 'bs58';
import {
  loadWalletFromStorage,
  validateMnemonic,
  type WalletAddresses,
} from './walletService';
import type { Blockchain } from '../../context/WalletContext';
import { deriveAddressForChain, deriveAddressFromPrivateKey, deriveBitcoinAddress, deriveBitcoinAddressFromPrivateKey, getDerivationMetadata, getAccountDerivationMetadata } from './chainAdapterRegistry';
import { assertWalletAuthorization, type WalletAuthorization } from './walletSecurityService';

const STORE_KEY = 'xu_wallet_vault_store_v1';
const STORE_VERSION = 2;

export type WalletSourceType = 'mnemonic' | 'private-key' | 'watch-only';

export interface WalletKeySource {
  id: string;
  type: 'mnemonic' | 'private-key';
  name: string;
  createdAt: number;
  blockchain?: Blockchain;
  /** Explicitly enabled chains; absent on legacy multi-chain sources. */
  blockchains?: Blockchain[];
}

export interface WalletAccount {
  id: string;
  sourceId: string | null;
  sourceType: WalletSourceType;
  name: string;
  accountIndex: number | null;
  derivationPaths: Partial<Record<Blockchain, string>>;
  addresses: Partial<WalletAddresses>;
  /** Versioned chain derivation details; absent for imported private-key/watch-only accounts. */
  derivationMetadata?: Partial<Record<Blockchain, import('./chainAdapterRegistry').ChainDerivationMetadata>>;
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
  version: 2;
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
  let parsed: WalletVaultStore;
  try {
    parsed = JSON.parse(raw) as WalletVaultStore;
  } catch {
    return null;
  }
  if (![1, STORE_VERSION].includes(parsed.version) || !Array.isArray(parsed.vaults)) return null;

  const upgraded: WalletVaultStore = {
    ...parsed,
    version: STORE_VERSION,
    vaults: await Promise.all(parsed.vaults.map(async (vault) => ({
      ...vault,
      accounts: await Promise.all(vault.accounts.map(async (account) => {
        if (account.sourceType !== 'mnemonic' || account.accountIndex === null || account.accountIndex === undefined) return account;
        const metadata = getAccountDerivationMetadata(account.accountIndex);
        let bitcoinTestnet = account.addresses.bitcoinTestnet;
        if (account.addresses.bitcoin && !bitcoinTestnet && account.sourceId) {
          const phrase = await SecureStore.getItemAsync(secretKey(account.sourceId));
          if (phrase) bitcoinTestnet = await deriveBitcoinAddress(phrase, account.accountIndex, 'testnet');
        }
        return {
          ...account,
          addresses: { ...account.addresses, ...(bitcoinTestnet ? { bitcoinTestnet } : {}) },
          derivationMetadata: account.derivationMetadata ?? metadata,
          derivationPaths: {
            ...(account.addresses.ethereum ? { ethereum: account.derivationPaths?.ethereum ?? metadata.ethereum.path } : {}),
            ...(account.addresses.bnb ? { bnb: account.derivationPaths?.bnb ?? metadata.bnb.path } : {}),
            ...(account.addresses.polygon ? { polygon: account.derivationPaths?.polygon ?? metadata.polygon.path } : {}),
            ...(account.addresses.arbitrum ? { arbitrum: account.derivationPaths?.arbitrum ?? metadata.arbitrum.path } : {}),
            ...(account.addresses.bitcoin ? { bitcoin: account.derivationPaths?.bitcoin ?? metadata.bitcoin.path } : {}),
            ...(account.addresses.tron ? { tron: account.derivationPaths?.tron ?? metadata.tron.path } : {}),
            ...(account.addresses.solana ? { solana: account.derivationPaths?.solana ?? metadata.solana.path } : {}),
          },
        };
      })),
    }))),
  };
  if (parsed.version !== STORE_VERSION || JSON.stringify(parsed) !== JSON.stringify(upgraded)) {
    await persistStore(upgraded);
  }
  return upgraded;
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
      const migratedAddresses: WalletAddresses = { ...legacy.addresses, bitcoinTestnet: legacy.addresses.bitcoin ? await deriveBitcoinAddress(legacy.mnemonic, 0, 'testnet') : '' };
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
        addresses: migratedAddresses,
        derivationMetadata: getAccountDerivationMetadata(0),
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

export async function getMnemonicForSource(sourceId: string, authorization: WalletAuthorization, action: 'export-secret' | 'sign-transaction' = 'export-secret'): Promise<string | null> {
  assertWalletAuthorization(authorization, action);
  const store = await getWalletVaultStore();
  const source = store.vaults.flatMap((vault) => vault.sources).find((item) => item.id === sourceId);
  if (!source || source.type !== 'mnemonic') throw new Error('Recovery phrase source not found.');
  return SecureStore.getItemAsync(secretKey(sourceId));
}

export async function getPrivateKeyForSource(sourceId: string, authorization: WalletAuthorization, action: 'export-secret' | 'sign-transaction' = 'export-secret'): Promise<string | null> {
  assertWalletAuthorization(authorization, action);
  const store = await getWalletVaultStore();
  const source = store.vaults.flatMap((vault) => vault.sources).find((item) => item.id === sourceId);
  if (!source || source.type !== 'private-key') throw new Error('Private-key source not found.');
  return SecureStore.getItemAsync(secretKey(sourceId));
}


export async function getWalletVaultStore(): Promise<WalletVaultStore> {
  return (await readStore()) ?? initializeWalletVaultStore();
}

/**
 * Creates the first vault-backed account after legacy wallet initialization.
 * The public addresses are supplied by the existing wallet derivation path so
 * this migration never silently changes an address already shown to the user.
 */
export async function createInitialMnemonicVault(
  mnemonic: string,
  addresses: WalletAddresses,
  name = 'My Wallet',
  blockchains: Blockchain[] = ['ethereum', 'bnb', 'polygon', 'arbitrum', 'solana', 'bitcoin', 'tron'],
): Promise<WalletVaultStore> {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(normalized)) throw new Error('Invalid recovery phrase.');
  const store = await getWalletVaultStore();
  if (store.activeAccountId && store.vaults.some((vault) => vault.accounts.some((account) => account.id === store.activeAccountId))) {
    return store;
  }

  const vaultId = makeId('vault');
  const sourceId = makeId('seed');
  const accountIndex = 0;
  const selectedChains = Array.from(new Set(blockchains));
  if (!selectedChains.length || selectedChains.some((chain) => !['ethereum', 'bnb', 'polygon', 'arbitrum', 'solana', 'bitcoin', 'tron'].includes(chain))) throw new Error('Select at least one supported blockchain.');
  const metadata = getAccountDerivationMetadata(accountIndex);
  const selectedAddresses = Object.fromEntries(selectedChains.map((chain) => [chain, addresses[chain]])) as Partial<WalletAddresses>;
  if (selectedChains.includes('bitcoin')) selectedAddresses.bitcoinTestnet = addresses.bitcoinTestnet;
  const source: WalletKeySource = {
    id: sourceId,
    type: 'mnemonic',
    name: 'Recovery Phrase',
    createdAt: Date.now(),
    blockchains: selectedChains,
  };
  const account: WalletAccount = {
    id: makeId('account'),
    sourceId,
    sourceType: 'mnemonic',
    name: 'Main Wallet',
    accountIndex,
    derivationPaths: Object.fromEntries(selectedChains.map((chain) => [chain, metadata[chain].path])),
    addresses: selectedAddresses,
    derivationMetadata: Object.fromEntries(selectedChains.map((chain) => [chain, metadata[chain]])),
    createdAt: Date.now(),
  };
  const vault: WalletVault = {
    id: vaultId,
    name: name.trim() || 'My Wallet',
    createdAt: Date.now(),
    sources: [source],
    accounts: [account],
  };

  await SecureStore.setItemAsync(secretKey(sourceId), normalized);
  const next: WalletVaultStore = {
    ...store,
    activeVaultId: vaultId,
    activeAccountId: account.id,
    vaults: [...store.vaults, vault],
  };
  try {
    await persistStore(next);
  } catch (error) {
    await SecureStore.deleteItemAsync(secretKey(sourceId)).catch(() => {});
    throw error;
  }
  return next;
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
  // Creating a new, empty vault must not switch away from the user's active wallet.
  const next = { ...store, vaults: [...store.vaults, vault] };
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
  authorization: WalletAuthorization,
  sourceName = 'Recovery Phrase',
  accountName = 'Main Wallet',
  blockchains: Blockchain[] = ['ethereum', 'bnb', 'polygon', 'arbitrum', 'solana', 'bitcoin', 'tron'],
): Promise<WalletVaultStore> {
  assertWalletAuthorization(authorization, 'import-secret');
  const mnemonic = mnemonicInput.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(mnemonic)) throw new Error('Invalid recovery phrase.');
  const selectedChains = Array.from(new Set(blockchains));
  if (!selectedChains.length || selectedChains.some((chain) => !['ethereum', 'bnb', 'polygon', 'arbitrum', 'solana', 'bitcoin', 'tron'].includes(chain))) throw new Error('Select at least one supported blockchain.');
  const addresses = await deriveAccountAddresses(mnemonic, 0, selectedChains);
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
    blockchains: selectedChains,
  };
  const metadata = Object.fromEntries(selectedChains.map((chain) => [chain, getDerivationMetadata(chain, 0)]));
  const paths = Object.fromEntries(selectedChains.map((chain) => [chain, getDerivationMetadata(chain, 0).path]));
  const account: WalletAccount = {
    id: makeId('account'),
    sourceId,
    sourceType: 'mnemonic',
    name: accountName.trim() || 'Main Wallet',
    accountIndex: 0,
    derivationPaths: paths,
    addresses,
    derivationMetadata: metadata,
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

async function deriveAccountAddresses(mnemonic: string, accountIndex: number, chains: Blockchain[]): Promise<Partial<WalletAddresses>> {
  const entries = await Promise.all(chains.map(async (chain) => [chain, await deriveAddressForChain(chain, mnemonic, accountIndex)] as const));
  const result = Object.fromEntries(entries) as Partial<WalletAddresses>;
  if (chains.includes('bitcoin')) result.bitcoinTestnet = await deriveBitcoinAddress(mnemonic, accountIndex, 'testnet');
  return result;
}

export async function addDerivedAccounts(
  vaultId: string,
  sourceId: string,
  count: number,
  authorization: WalletAuthorization,
  namePrefix = 'Account',
  blockchain?: Blockchain,
): Promise<WalletVaultStore> {
  assertWalletAuthorization(authorization, 'derive-account');
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('Choose between 1 and 20 accounts.');
  const store = await getWalletVaultStore();
  const vault = findVault(store, vaultId);
  const source = vault.sources.find((item) => item.id === sourceId);
  if (!source || source.type !== 'mnemonic') throw new Error('Recovery phrase source not found.');
  const phrase = await SecureStore.getItemAsync(secretKey(sourceId));
  if (!phrase) throw new Error('Recovery phrase is unavailable. Restore this wallet.');
  const enabledChains = source.blockchains?.length ? source.blockchains : (['ethereum', 'bnb', 'polygon', 'arbitrum', 'solana', 'bitcoin', 'tron'] as Blockchain[]);
  // A chain-scoped Add Wallet must never silently create sibling-chain accounts.
  const targetChains = blockchain ? [blockchain] : enabledChains;
  if (targetChains.some((chain) => !enabledChains.includes(chain))) {
    throw new Error('This recovery phrase is not enabled for the selected blockchain.');
  }
  const used = vault.accounts.filter((a) => a.sourceId === sourceId && a.accountIndex !== null).map((a) => a.accountIndex as number);
  const first = used.length ? Math.max(...used) + 1 : 0;
  const created: WalletAccount[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = first + i;
    const addresses = await deriveAccountAddresses(phrase, index, targetChains);
    if (accountExists({ ...vault, accounts: [...vault.accounts, ...created] }, addresses)) throw new Error('A derived account already exists. No accounts were added.');
    const fullMetadata = getAccountDerivationMetadata(index);
    const derivationMetadata = Object.fromEntries(targetChains.map((chain) => [chain, fullMetadata[chain]]));
    const derivationPaths = Object.fromEntries(targetChains.map((chain) => [chain, fullMetadata[chain].path]));
    created.push({
      id: makeId('account'), sourceId, sourceType: 'mnemonic',
      name: `${namePrefix.trim() || 'Account'} ${index + 1}`, accountIndex: index,
      derivationPaths,
      derivationMetadata, addresses, createdAt: Date.now(),
    });
  }
  const next = withActive({ ...store, vaults: store.vaults.map((v) => v.id === vaultId ? { ...v, accounts: [...v.accounts, ...created] } : v) }, vaultId, created[created.length - 1].id);
  await persistStore(next);
  return next;
}
export async function addDerivedAccount(vaultId: string, sourceId: string, authorization: WalletAuthorization, accountName?: string): Promise<WalletVaultStore> {
  return addDerivedAccounts(vaultId, sourceId, 1, authorization, accountName || 'Account');
}

export async function addPrivateKeyAccount(
  vaultId: string,
  blockchain: Blockchain,
  privateKeyInput: string,
  authorization: WalletAuthorization,
  accountName = 'Imported Key',
): Promise<WalletVaultStore> {
  assertWalletAuthorization(authorization, 'import-secret');
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
    addresses = blockchain === 'bitcoin'
      ? { bitcoin: deriveBitcoinAddressFromPrivateKey(normalizedKey, 'mainnet'), bitcoinTestnet: deriveBitcoinAddressFromPrivateKey(normalizedKey, 'testnet') }
      : { [blockchain]: deriveAddressFromPrivateKey(blockchain, normalizedKey) };
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
  for (const chain of ['ethereum', 'bnb', 'polygon', 'arbitrum', 'solana', 'bitcoin', 'tron'] as Blockchain[]) {
    const value = addressesInput[chain]?.trim();
    if (!value) continue;
    if (chain === 'solana') {
      try {
        if (bs58.decode(value).length !== 32) throw new Error('invalid');
      } catch {
        throw new Error('Invalid Solana public address.');
      }
      addresses.solana = value;
    } else if (chain === 'bitcoin' || chain === 'tron') {
      let decoded: Uint8Array;
      try { decoded = bs58.decode(value); } catch { throw new Error(`Invalid ${chain} address.`); }
      if (decoded.length !== 25) throw new Error(`Invalid ${chain} address.`);
      const payload = decoded.slice(0, 21);
      const checksum = decoded.slice(21);
      const { sha256 } = await import('@noble/hashes/sha2.js');
      const expected = sha256(sha256(payload)).slice(0, 4);
      const expectedPrefix = chain === 'bitcoin' ? [0x00, 0x05, 0x6f, 0xc4] : [0x41];
      if (checksum.some((byte, i) => byte !== expected[i]) || !expectedPrefix.includes(payload[0])) {
        throw new Error(`Invalid ${chain} address.`);
      }
      if (chain === 'bitcoin') {
        if (payload[0] === 0x00 || payload[0] === 0x05) addresses.bitcoin = value;
        else addresses.bitcoinTestnet = value;
      } else addresses.tron = value;
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

export async function removeWalletAccount(vaultId: string, accountId: string, authorization: WalletAuthorization): Promise<WalletVaultStore> {
  assertWalletAuthorization(authorization, 'delete-account');
  const store = await getWalletVaultStore();
  const vault = findVault(store, vaultId);
  const account = vault.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error('Wallet account not found.');

  const accounts = vault.accounts.filter((item) => item.id !== accountId);
  const sourceStillUsed = account.sourceId
    ? store.vaults.some((item) => item.accounts.some((other) => other.id !== accountId && other.sourceId === account.sourceId))
    : true;
  const sources = account.sourceId && !sourceStillUsed
    ? vault.sources.filter((source) => source.id !== account.sourceId)
    : vault.sources;
  const nextVaults = store.vaults.map((item) => item.id === vaultId ? { ...item, accounts, sources } : item);
  const remaining = nextVaults.flatMap((item) => item.accounts);
  const activeAccountId = store.activeAccountId === accountId ? (remaining[0]?.id ?? null) : store.activeAccountId;
  const activeVaultId = store.activeAccountId === accountId
    ? (remaining[0] ? nextVaults.find((item) => item.accounts.some((entry) => entry.id === remaining[0].id))?.id ?? null : null)
    : store.activeVaultId;
  const next = { ...store, vaults: nextVaults, activeVaultId, activeAccountId };
  await persistStore(next);
  if (account.sourceId && !sourceStillUsed) {
    await SecureStore.deleteItemAsync(secretKey(account.sourceId)).catch(() => {});
  }
  return next;
}

export async function clearWalletVaultStore(authorization: WalletAuthorization): Promise<void> {
  assertWalletAuthorization(authorization, 'delete-account');
  const store = await readStore();
  await AsyncStorage.removeItem(STORE_KEY);
  if (!store) return;
  await Promise.all(store.vaults.flatMap((vault) =>
    vault.sources.map((source) => SecureStore.deleteItemAsync(secretKey(source.id)).catch(() => {}))
  ));
}
