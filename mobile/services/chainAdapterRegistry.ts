import { ethers } from 'ethers';
import * as bip39 from 'bip39';
import * as ed from '@noble/ed25519';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512, sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import bs58 from 'bs58';

export type WalletChainId = 'ethereum' | 'bnb' | 'polygon' | 'arbitrum' | 'solana' | 'bitcoin' | 'tron';
export type ChainAdapterId = WalletChainId;
export type DerivationCurve = 'secp256k1' | 'ed25519';
export type AddressFormat = 'EVM-hex' | 'Solana-base58' | 'Bitcoin-base58check' | 'Tron-base58check';

export interface ChainDerivationMetadata {
  coinType: number;
  curve: DerivationCurve;
  derivationStandard: 'BIP-44' | 'SLIP-0010' | 'legacy';
  derivationAlgorithm: 'BIP-32' | 'SLIP-0010' | 'legacy-seed';
  path: string;
  addressFormat: AddressFormat;
  schemeVersion: 1;
}

export interface ChainAdapter {
  chain: ChainAdapterId;
  coinType: number;
  curve: DerivationCurve;
  derivationStandard: 'BIP-44' | 'SLIP-0010';
  derivationAlgorithm: 'BIP-32' | 'SLIP-0010';
  addressFormat: AddressFormat;
  getPath(accountIndex: number): string;
  deriveAddress(mnemonic: string, accountIndex: number): Promise<string>;
}

const assertAccountIndex = (index: number): void => {
  if (!Number.isSafeInteger(index) || index < 0 || index > 0x7fffffff) throw new Error('Account index must be a safe non-negative integer.');
};
const bip44Path = (coinType: number, index: number) => {
  assertAccountIndex(index);
  return `m/44'/${coinType}'/0'/0/${index}`;
};
const evmPath = (index: number) => bip44Path(60, index);

function base58Check(payload: Uint8Array): string {
  const first = sha256(payload);
  const checksum = sha256(first).slice(0, 4);
  const combined = new Uint8Array(payload.length + 4);
  combined.set(payload);
  combined.set(checksum, payload.length);
  return bs58.encode(combined);
}

async function deriveSolanaSlip10(mnemonic: string, accountIndex: number): Promise<string> {
  assertAccountIndex(accountIndex);
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const keyName = new Uint8Array([101,100,50,53,53,49,57,32,115,101,101,100]);
  let digest = hmac(sha512, keyName, seed);
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

const evmAdapter = (chain: 'ethereum' | 'bnb' | 'polygon' | 'arbitrum'): ChainAdapter => ({
  chain, coinType: 60, curve: 'secp256k1', derivationStandard: 'BIP-44',
  derivationAlgorithm: 'BIP-32', addressFormat: 'EVM-hex', getPath: evmPath,
  async deriveAddress(mnemonic, accountIndex) {
    return ethers.HDNodeWallet.fromPhrase(mnemonic, '', evmPath(accountIndex)).address;
  },
});

const bitcoinAdapter: ChainAdapter = {
  chain: 'bitcoin', coinType: 0, curve: 'secp256k1', derivationStandard: 'BIP-44',
  derivationAlgorithm: 'BIP-32', addressFormat: 'Bitcoin-base58check',
  getPath: index => bip44Path(0, index),
  async deriveAddress(mnemonic, accountIndex) {
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, '', bip44Path(0, accountIndex));
    const compressedPublicKey = ethers.getBytes(ethers.SigningKey.computePublicKey(wallet.privateKey, true));
    const hash160 = ripemd160(sha256(compressedPublicKey));
    const payload = new Uint8Array(21);
    payload[0] = 0x00; // Bitcoin mainnet P2PKH version byte
    payload.set(hash160, 1);
    return base58Check(payload);
  },
};

const tronAdapter: ChainAdapter = {
  chain: 'tron', coinType: 195, curve: 'secp256k1', derivationStandard: 'BIP-44',
  derivationAlgorithm: 'BIP-32', addressFormat: 'Tron-base58check',
  getPath: index => bip44Path(195, index),
  async deriveAddress(mnemonic, accountIndex) {
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, '', bip44Path(195, accountIndex));
    const evmAddressBytes = ethers.getBytes(ethers.computeAddress(wallet.privateKey));
    const payload = new Uint8Array(21);
    payload[0] = 0x41; // TRON address prefix
    payload.set(evmAddressBytes, 1);
    return base58Check(payload);
  },
};

const adapters = new Map<WalletChainId, ChainAdapter>([
  ['ethereum', evmAdapter('ethereum')],
  ['bnb', evmAdapter('bnb')],
  ['polygon', evmAdapter('polygon')],
  ['arbitrum', evmAdapter('arbitrum')],
  ['bitcoin', bitcoinAdapter],
  ['tron', tronAdapter],
  ['solana', {
    chain: 'solana', coinType: 501, curve: 'ed25519', derivationStandard: 'SLIP-0010',
    derivationAlgorithm: 'SLIP-0010', addressFormat: 'Solana-base58',
    getPath: index => { assertAccountIndex(index); return `m/44'/501'/${index}'/0'`; },
    async deriveAddress(mnemonic, accountIndex) {
      assertAccountIndex(accountIndex);
      // Preserve the original XU Solana account-zero address for existing wallets.
      if (accountIndex === 0) return bs58.encode(await ed.getPublicKeyAsync(bip39.mnemonicToSeedSync(mnemonic).slice(0, 32)));
      return deriveSolanaSlip10(mnemonic, accountIndex);
    },
  }],
]);


export function deriveAddressFromPrivateKey(chain: Exclude<WalletChainId, 'solana'>, privateKeyInput: string): string {
  const normalized = privateKeyInput.trim().startsWith('0x') ? privateKeyInput.trim() : `0x${privateKeyInput.trim()}`;
  const wallet = new ethers.Wallet(normalized);
  if (['ethereum','bnb','polygon','arbitrum'].includes(chain)) return wallet.address;
  if (chain === 'bitcoin') {
    const publicKey = ethers.getBytes(ethers.SigningKey.computePublicKey(wallet.privateKey, true));
    const payload = new Uint8Array(21);
    payload[0] = 0x00;
    payload.set(ripemd160(sha256(publicKey)), 1);
    return base58Check(payload);
  }
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(ethers.getBytes(ethers.computeAddress(wallet.privateKey)), 1);
  return base58Check(payload);
}

export function registerChainAdapter(adapter: ChainAdapter): void {
  if (!adapter || !/^[a-z][a-z0-9-]{1,31}$/.test(adapter.chain)
    || !Number.isInteger(adapter.coinType) || adapter.coinType < 0 || adapter.coinType > 0x7fffffff
    || typeof adapter.getPath !== 'function' || typeof adapter.deriveAddress !== 'function') {
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
export function getRegisteredChainAdapters(): ReadonlyArray<Pick<ChainAdapter, 'chain'|'coinType'|'curve'|'derivationStandard'|'derivationAlgorithm'|'addressFormat'>> {
  return Array.from(adapters.values(), ({chain,coinType,curve,derivationStandard,derivationAlgorithm,addressFormat}) =>
    Object.freeze({chain,coinType,curve,derivationStandard,derivationAlgorithm,addressFormat}));
}
export async function deriveAddressForChain(chain: ChainAdapterId, mnemonic: string, accountIndex: number): Promise<string> {
  assertAccountIndex(accountIndex);
  if (!mnemonic || !bip39.validateMnemonic(mnemonic.trim())) throw new Error('Invalid recovery phrase.');
  return getChainAdapter(chain).deriveAddress(mnemonic.trim(), accountIndex);
}
export function getDerivationMetadata(chain: WalletChainId, accountIndex: number): ChainDerivationMetadata {
  assertAccountIndex(accountIndex);
  const adapter = getChainAdapter(chain);
  if (chain === 'solana' && accountIndex === 0) return {
    coinType: adapter.coinType, curve: adapter.curve, derivationStandard: 'legacy',
    derivationAlgorithm: 'legacy-seed', path: 'legacy:first-32-bytes-of-bip39-seed',
    addressFormat: adapter.addressFormat, schemeVersion: 1,
  };
  return {
    coinType: adapter.coinType, curve: adapter.curve, derivationStandard: adapter.derivationStandard,
    derivationAlgorithm: adapter.derivationAlgorithm, path: adapter.getPath(accountIndex),
    addressFormat: adapter.addressFormat, schemeVersion: 1,
  };
}
export function getAccountDerivationMetadata(index: number): Record<WalletChainId, ChainDerivationMetadata> {
  return {
    ethereum: getDerivationMetadata('ethereum', index), bnb: getDerivationMetadata('bnb', index),
    polygon: getDerivationMetadata('polygon', index), arbitrum: getDerivationMetadata('arbitrum', index),
    solana: getDerivationMetadata('solana', index), bitcoin: getDerivationMetadata('bitcoin', index),
    tron: getDerivationMetadata('tron', index),
  };
}
export async function deriveWalletAddresses(mnemonic: string, index: number): Promise<Record<WalletChainId, string>> {
  assertAccountIndex(index);
  const chains = await Promise.all((['ethereum','solana','bitcoin','tron'] as WalletChainId[]).map(chain =>
    getChainAdapter(chain).deriveAddress(mnemonic, index)));
  const [ethereum,solana,bitcoin,tron] = chains;
  return {ethereum,bnb:ethereum,polygon:ethereum,arbitrum:ethereum,solana,bitcoin,tron};
}

/** Bitcoin's test networks use SLIP-0044 coin type 1, not mainnet coin type 0. */
export async function deriveBitcoinAddress(mnemonic:string,accountIndex:number,network:'mainnet'|'testnet'='mainnet'):Promise<string>{
 assertAccountIndex(accountIndex);
 if(!mnemonic||!bip39.validateMnemonic(mnemonic.trim()))throw new Error('Invalid recovery phrase.');
 const coinType=network==='mainnet'?0:1;
 const wallet=ethers.HDNodeWallet.fromPhrase(mnemonic.trim(),'',bip44Path(coinType,accountIndex));
 const publicKey=ethers.getBytes(ethers.SigningKey.computePublicKey(wallet.privateKey,true));
 const payload=new Uint8Array(21);
 payload[0]=network==='mainnet'?0x00:0x6f;
 payload.set(ripemd160(sha256(publicKey)),1);
 return base58Check(payload);
}

export function deriveBitcoinAddressFromPrivateKey(privateKeyInput:string,network:'mainnet'|'testnet'='mainnet'):string{
 const normalized=privateKeyInput.trim().startsWith('0x')?privateKeyInput.trim():`0x${privateKeyInput.trim()}`;
 const wallet=new ethers.Wallet(normalized);
 const publicKey=ethers.getBytes(ethers.SigningKey.computePublicKey(wallet.privateKey,true));
 const payload=new Uint8Array(21);payload[0]=network==='mainnet'?0x00:0x6f;
 payload.set(ripemd160(sha256(publicKey)),1);return base58Check(payload);
}
