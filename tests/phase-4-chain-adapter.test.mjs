import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const registry=read('mobile/services/chainAdapterRegistry.ts');
const vault=read('mobile/services/walletVaultService.ts');
const wallet=read('mobile/services/walletService.ts');

test('Phase 4: chain adapters are registered by extensible string identifier',()=>{
  assert.match(registry,/export type ChainAdapterId = string/);
  assert.match(registry,/registerChainAdapter\(adapter: ChainAdapter\)/);
  assert.match(registry,/Map<ChainAdapterId, ChainAdapter>/);
  assert.match(registry,/getRegisteredChainAdapters/);
  assert.match(registry,/deriveAddressForChain/);
  assert.match(registry,/A chain adapter is already registered/);
});

test('Phase 4: adapter registration validates coin type, curve, standards and address format',()=>{
  assert.match(registry,/adapter\.coinType > 0x7fffffff/);
  assert.match(registry,/\['secp256k1', 'ed25519'\]/);
  assert.match(registry,/\['BIP-44', 'SLIP-0010'\]/);
  assert.match(registry,/\['BIP-32', 'SLIP-0010'\]/);
  assert.match(registry,/\['EVM-hex', 'Solana-base58'\]/);
  assert.match(registry,/Object\.freeze\(adapter\)/);
});

test('Phase 4: future Bitcoin and Tron coin types are documented but not enabled',()=>{
  assert.match(registry,/bitcoin: 0/);
  assert.match(registry,/tron: 195/);
  assert.match(registry,/not enabled yet/);
  assert.doesNotMatch(registry,/bitcoin:\s*\{/);
  assert.doesNotMatch(registry,/tron:\s*\{/);
});

test('Phase 4: legacy Solana account zero and shared EVM derivation remain compatible',()=>{
  assert.match(registry,/legacy:first-32-bytes-of-bip39-seed/);
  assert.match(registry,/m\/44'\/60'\/0'\/0\/\$\{accountIndex\}/);
  assert.match(registry,/m\/44'\/501'\/\$\{accountIndex\}'\/0'/);
  assert.match(wallet,/seed\.slice\(0, 32\)/);
});

test('Phase 4: vault persists derivation paths and versioned metadata per mnemonic account',()=>{
  assert.match(vault,/derivationMetadata\?: Partial<Record<Blockchain/);
  assert.match(vault,/getAccountDerivationMetadata\(account\.accountIndex\)/);
  assert.match(vault,/const derivationMetadata = getAccountDerivationMetadata\(index\)/);
  assert.match(vault,/derivationMetadata, addresses/);
  assert.match(vault,/deriveWalletAddresses\(mnemonic, accountIndex\)/);
});
