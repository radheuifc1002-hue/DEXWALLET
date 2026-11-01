import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import * as bip39 from 'bip39';
import * as ed from '@noble/ed25519';
import bs58 from 'bs58';
import {
  deriveWalletAddresses,
  getAccountDerivationMetadata,
  getChainAdapter,
  registerChainAdapter,
} from '../mobile/services/chainAdapterRegistry.ts';

const PHRASE = 'test test test test test test test test test test test junk';

test('EVM account zero preserves the existing BIP-44 address', async () => {
  const addresses = await deriveWalletAddresses(PHRASE, 0);
  assert.equal(addresses.ethereum, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  assert.equal(addresses.bnb, addresses.ethereum);
  assert.equal(addresses.polygon, addresses.ethereum);
});

test('EVM derived accounts retain the existing address-index path convention', async () => {
  const accountIndex = 3;
  const expected = ethers.HDNodeWallet.fromPhrase(PHRASE, '', "m/44'/60'/0'/0/3").address;
  const addresses = await deriveWalletAddresses(PHRASE, accountIndex);
  assert.equal(addresses.ethereum, expected);
  assert.notEqual(addresses.ethereum, (await deriveWalletAddresses(PHRASE, 0)).ethereum);
});

test('Solana account zero preserves the legacy first-32-bytes seed derivation', async () => {
  const seed = bip39.mnemonicToSeedSync(PHRASE).slice(0, 32);
  const expected = bs58.encode(await ed.getPublicKeyAsync(seed));
  const addresses = await deriveWalletAddresses(PHRASE, 0);
  assert.equal(addresses.solana, expected);
});

test('derivation metadata records curve, coin type, algorithm and exact paths', () => {
  const metadata = getAccountDerivationMetadata(2);
  assert.equal(metadata.ethereum.coinType, 60);
  assert.equal(metadata.ethereum.curve, 'secp256k1');
  assert.equal(metadata.ethereum.path, "m/44'/60'/0'/0/2");
  assert.equal(metadata.solana.coinType, 501);
  assert.equal(metadata.solana.curve, 'ed25519');
  assert.equal(metadata.solana.derivationAlgorithm, 'SLIP-0010');
  assert.equal(metadata.solana.path, "m/44'/501'/2'/0'");
  assert.equal(getAccountDerivationMetadata(0).solana.path, 'legacy:first-32-bytes-of-bip39-seed');
});

test('registry rejects replacing an existing chain adapter', () => {
  const existing = getChainAdapter('ethereum');
  assert.throws(() => registerChainAdapter(existing), /already registered/);
});
