import { ethers } from 'ethers';
import * as bip39 from 'bip39';
import * as ed from '@noble/ed25519';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import bs58 from 'bs58';

export type WalletChainId = 'ethereum' | 'bnb' | 'polygon' | 'solana';
export type ChainAdapterId = string;

/** Coin types reserved for later adapter implementations; these chains are not enabled yet. */
export const FUTURE_CHAIN_COIN_TYPES = Object.freeze({ bitcoin: 0, tron: 195 } as const);
export type DerivationCurve = 'secp256k1' | 'ed25519';

export interface ChainDerivationMetadata {
  coinType: number;
  curve: DerivationCurve;
  derivationStandard: 'BIP-44' | 'SLIP-0010' | 'legacy';
  derivationAlgorithm: 'BIP-32' | 'SLIP-0010' | 'legacy-seed';
  path: string;
  addressFormat: 'EVM-hex' | 'Solana-base58';
  schemeVersion: 1;
}

export interface ChainAdapter {
  chain: ChainAdapterId;
  coinType: number;
  curve: DerivationCurve;
  derivationStandard: 'BIP-44' | 'SLIP-0010';
  derivationAlgorithm: 'BIP-32' | 'SLIP-0010';
  addressFormat: 'EVM-hex' | 'Solana-base58';
  getPath(accountIndex: number): string;
  deriveAddress(mnemonic: string, accountIndex: number): Promise<string>;
}

const assertAccountIndex = (accountIndex: number): void => {
  if (!Number.isSafeInteger(accountIndex) || accountIndex < 0 || accountIndex > 0x7fffffff) {
    throw new Error('Account index must be a safe non-negative integer.');
  }
};

const evmPath = (accountIndex: number) => {
  assertAccountIndex(accountIndex);
  return `m/44'/60'/0'/0/${accountIndex}`;
};

async function deriveSolanaSlip10(mnemonic: string, accountIndex: number): Promise<string> {
  assertAccountIndex(accountIndex);
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const slip10Key = new Uint8Array([101, 100, 50, 53, 53, 49, 57, 32, 115, 101, 101, 100]);
  let digest = hmac(sha512, slip10Key, seed);
  let key = digest.slice(0, 32);
  let chainCode = digest.slice(32);

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

const evmAdapter = (chain: 'ethereum' | 'bnb' | 'polygon'): ChainAdapter => ({
  chain,
  coinType: 60,
  curve: 'secp256k1',
  derivationStandard: 'BIP-44',
  derivationAlgorithm: 'BIP-32',
  addressFormat: 'EVM-hex',
  getPath: evmPath,
  async deriveAddress(mnemonic, accountIndex) {
    return ethers.HDNodeWallet.fromPhrase(mnemonic, '', evmPath(accountIndex)).address;
  },
});

const adapters = new Map<ChainAdapterId, ChainAdapter>(Object.entries({
  ethereum: evmAdapter('ethereum'),
  bnb: evmAdapter('bnb'),
  polygon: evmAdapter('polygon'),
  solana: {
    chain: 'solana',
    coinType: 501,
    curve: 'ed25519',
    derivationStandard: 'SLIP-0010',
    derivationAlgorithm: 'SLIP-0010',
    addressFormat: 'Solana-base58',
    getPath: (accountIndex) => { assertAccountIndex(accountIndex); return `m/44'/501'/${accountIndex}'/0'`; },
    async deriveAddress(mnemonic, accountIndex) {
      assertAccountIndex(accountIndex);
      // The original XU Solana account used the first 32 bytes of the BIP-39
      // seed directly. Keep that address stable; later accounts use SLIP-0010.
      if (accountIndex === 0) {
        const seed = bip39.mnemonicToSeedSync(mnemonic);
        return bs58.encode(await ed.getPublicKeyAsync(seed.slice(0, 32)));
      }
      return deriveSolanaSlip10(mnemonic, accountIndex);
    },
  },
} as Record<WalletChainId, ChainAdapter>) as [WalletChainId, ChainAdapter][]);

/** Register a chain implementation without coupling it to vault persistence. */
export function registerChainAdapter(adapter: ChainAdapter): void {
  if (typeof adapter.chain !== 'string' || !/^[a-z][a-z0-9-]{1,31}$/.test(adapter.chain)
    || !Number.isInteger(adapter.coinType) || adapter.coinType < 0 || adapter.coinType > 0x7fffffff
    || !adapter.getPath || typeof adapter.deriveAddress !== 'function'
    || !['secp256k1', 'ed25519'].includes(adapter.curve)
    || !['BIP-44', 'SLIP-0010'].includes(adapter.derivationStandard)
    || !['BIP-32', 'SLIP-0010'].includes(adapter.derivationAlgorithm)
    || !['EVM-hex', 'Solana-base58'].includes(adapter.addressFormat)) {
    throw new Error('Invalid chain adapter registration.');
  }
  if (adapters.has(adapter.chain)) throw new Error(`A chain adapter is already registered for ${adapter.chain}.`);
  adapters.set(adapter.chain, Object.freeze(adapter));
}

export function getChainAdapter(chain: ChainAdapterId): ChainAdapter {
  const adapter = adapters.get(chain);
  if (!adapter) throw new Error(`No derivation adapter is registered for ${chain}.`);
  return adapter;
}

/** Public, secret-free registry view for diagnostics and chain capability discovery. */
export function getRegisteredChainAdapters(): ReadonlyArray<Pick<ChainAdapter, 'chain' | 'coinType' | 'curve' | 'derivationStandard' | 'derivationAlgorithm' | 'addressFormat'>> {
  return Array.from(adapters.values(), ({ chain, coinType, curve, derivationStandard, derivationAlgorithm, addressFormat }) =>
    Object.freeze({ chain, coinType, curve, derivationStandard, derivationAlgorithm, addressFormat })
  );
}

/** Derive a single chain address without coupling callers to a concrete chain implementation. */
export async function deriveAddressForChain(chain: ChainAdapterId, mnemonic: string, accountIndex: number): Promise<string> {
  if (!Number.isInteger(accountIndex) || accountIndex < 0) throw new Error('Account index must be a non-negative integer.');
  if (!mnemonic || !bip39.validateMnemonic(mnemonic.trim())) throw new Error('Invalid recovery phrase.');
  return getChainAdapter(chain).deriveAddress(mnemonic.trim(), accountIndex);
}

export function getDerivationMetadata(chain: WalletChainId, accountIndex: number): ChainDerivationMetadata {
  assertAccountIndex(accountIndex);
  const adapter = getChainAdapter(chain);
  if (chain === 'solana' && accountIndex === 0) {
    return {
      coinType: adapter.coinType,
      curve: adapter.curve,
      derivationStandard: 'legacy',
      derivationAlgorithm: 'legacy-seed',
      path: 'legacy:first-32-bytes-of-bip39-seed',
      addressFormat: adapter.addressFormat,
      schemeVersion: 1,
    };
  }
  return {
    coinType: adapter.coinType,
    curve: adapter.curve,
    derivationStandard: adapter.derivationStandard,
    derivationAlgorithm: adapter.derivationAlgorithm,
    path: adapter.getPath(accountIndex),
    addressFormat: adapter.addressFormat,
    schemeVersion: 1,
  };
}

export function getAccountDerivationMetadata(accountIndex: number): Record<WalletChainId, ChainDerivationMetadata> {
  return {
    ethereum: getDerivationMetadata('ethereum', accountIndex),
    bnb: getDerivationMetadata('bnb', accountIndex),
    polygon: getDerivationMetadata('polygon', accountIndex),
    solana: getDerivationMetadata('solana', accountIndex),
  };
}

export async function deriveWalletAddresses(mnemonic: string, accountIndex: number): Promise<Record<WalletChainId, string>> {
  assertAccountIndex(accountIndex);
  const [ethereum, solana] = await Promise.all([
    getChainAdapter('ethereum').deriveAddress(mnemonic, accountIndex),
    getChainAdapter('solana').deriveAddress(mnemonic, accountIndex),
  ]);
  return { ethereum, bnb: ethereum, polygon: ethereum, solana };
}
