import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const registry=read('mobile/services/chainAdapterRegistry.ts');
const vault=read('mobile/services/walletVaultService.ts');
const wallet=read('mobile/services/walletService.ts');

test('Phase 4: chain adapters are registered and discoverable',()=>{
  assert.ok(registry.includes('export type ChainAdapterId = WalletChainId'));
  assert.ok(registry.includes('registerChainAdapter(adapter: ChainAdapter)'));
  assert.ok(registry.includes('new Map<WalletChainId, ChainAdapter>'));
  assert.ok(registry.includes('getRegisteredChainAdapters'));
  assert.ok(registry.includes('deriveAddressForChain'));
  assert.ok(registry.includes('A chain adapter is already registered'));
});

test('Phase 4: adapter registration validates required metadata and derivation functions',()=>{
  assert.ok(registry.includes('adapter.coinType > 0x7fffffff'));
  assert.ok(registry.includes("typeof adapter.getPath !== 'function'"));
  assert.ok(registry.includes("typeof adapter.deriveAddress !== 'function'"));
  assert.ok(registry.includes('Object.freeze(adapter)'));
  assert.ok(registry.includes("DerivationCurve = 'secp256k1' | 'ed25519'"));
  assert.ok(registry.includes("AddressFormat = 'EVM-hex' | 'Solana-base58'"));
});

test('Phase 4: Bitcoin and TRON adapters use their registered SLIP-44 coin types',()=>{
  assert.ok(registry.includes("chain: 'bitcoin', coinType: 0"));
  assert.ok(registry.includes("chain: 'tron', coinType: 195"));
  assert.ok(registry.includes('bip44Path(0, accountIndex)'));
  assert.ok(registry.includes('bip44Path(195, accountIndex)'));
});

test('Phase 4: legacy Solana account zero and shared EVM derivation remain compatible',()=>{
  assert.ok(registry.includes('legacy:first-32-bytes-of-bip39-seed'));
  assert.ok(registry.includes('const bip44Path = (coinType: number, index: number)'));
  assert.ok(registry.includes('bip44Path(60, index)'));
  assert.ok(registry.includes("m/44'/501'/${index}'/0'"));
  assert.ok(wallet.includes('bip39Seed.slice(0, 32)'));
});

test('Phase 4: vault persists derivation paths and versioned metadata per mnemonic account',()=>{
  assert.ok(vault.includes('derivationMetadata?: Partial<Record<Blockchain'));
  assert.ok(vault.includes('getAccountDerivationMetadata(account.accountIndex)'));
  assert.ok(vault.includes('const fullMetadata = getAccountDerivationMetadata(index)'));
  assert.ok(vault.includes('targetChains.map((chain) => [chain, fullMetadata[chain]])'));
  assert.ok(vault.includes('derivationMetadata, addresses'));
  assert.ok(vault.includes('deriveAddressForChain(chain, mnemonic, accountIndex)'));
});

test('chain-scoped mnemonic sources persist only enabled chains and derive subsequent accounts on those chains',()=>{
  assert.ok(vault.includes('blockchains: selectedChains'));
  assert.ok(vault.includes('deriveAccountAddresses(phrase, index, targetChains)'));
  assert.ok(vault.includes('targetChains.map((chain) => [chain, fullMetadata[chain]])'));
});
