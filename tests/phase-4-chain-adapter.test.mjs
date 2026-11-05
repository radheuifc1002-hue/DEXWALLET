import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const registry=read('mobile/services/chainAdapterRegistry.ts');
const vault=read('mobile/services/walletVaultService.ts');
const wallet=read('mobile/services/walletService.ts');

test('Phase 4: chain adapters are registered by extensible string identifier',()=>{
  assert.match(registry,/export type ChainAdapterId = WalletChainId/);
  assert.match(registry,/registerChainAdapter\(adapter: ChainAdapter\)/);
  assert.match(registry,/new Map<WalletChainId, ChainAdapter>/);
  assert.match(registry,/getRegisteredChainAdapters/);
  assert.match(registry,/deriveAddressForChain/);
  assert.match(registry,/A chain adapter is already registered/);
});

test('Phase 4: adapter registration validates coin type and required derivation functions',()=>{
  assert.match(registry,/adapter\\.coinType > 0x7fffffff/);
  assert.match(registry,/typeof adapter\\.getPath === 'function'/);
  assert.match(registry,/typeof adapter\\.deriveAddress === 'function'/);
  assert.match(registry,/Object\\.freeze\\(adapter\\)/);
  assert.match(registry,/DerivationCurve = 'secp256k1' \\| 'ed25519'/);
  assert.match(registry,/AddressFormat = 'EVM-hex' \\| 'Solana-base58'/);
});

test('Phase 4: Bitcoin and TRON adapters use their registered SLIP-44 coin types',()=>{
  assert.match(registry,/chain: 'bitcoin', coinType: 0/);
  assert.match(registry,/chain: 'tron', coinType: 195/);
  assert.match(registry,/bip44Path\\(0, accountIndex\\)/);
  assert.match(registry,/bip44Path\\(195, accountIndex\\)/);
});

test('Phase 4: legacy Solana account zero and shared EVM derivation remain compatible',()=>{
  assert.match(registry,/legacy:first-32-bytes-of-bip39-seed/);
  assert.match(registry,/const bip44Path = \\(coinType: number, index: number\\)/);
  assert.match(registry,/bip44Path\\(60, index\\)/);
  assert.match(registry,/m\\/44'\\/501'\\/\\$\\{accountIndex\\}'\\/0'/);
  assert.match(wallet,/seed\\.slice\\(0, 32\\)/);
});

test('Phase 4: vault persists derivation paths and versioned metadata per mnemonic account',()=>{
  assert.match(vault,/derivationMetadata\\?: Partial<Record<Blockchain/);
  assert.match(vault,/getAccountDerivationMetadata\\(account\\.accountIndex\\)/);
  assert.match(vault,/const fullMetadata = getAccountDerivationMetadata\\(index\\)/);
  assert.match(vault,/targetChains\\.map\\(\\(chain\\) => \\[chain, fullMetadata\\[chain\\]\\]\\)/);
  assert.match(vault,/derivationMetadata, addresses/);
  assert.match(vault,/deriveAddressForChain\\(chain, mnemonic, accountIndex\\)/);
  assert.match(vault,/sourceChains = source\\.blockchains\\?\\.length/);
});


test('chain-scoped mnemonic sources persist only enabled chains and derive subsequent accounts on those chains',()=>{
  assert.match(vault,/blockchains: selectedChains/);
  assert.match(vault,/deriveAccountAddresses\\(phrase, index, targetChains\\)/);
  assert.match(vault,/targetChains\\.map\\(\\(chain\\) => \\[chain, fullMetadata\\[chain\\]\\]\\)/);
});
