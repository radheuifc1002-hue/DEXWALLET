import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const derivation = read('mobile/services/chainAdapterRegistry.ts');
const wallet = read('mobile/services/walletService.ts');
const vault = read('mobile/services/walletVaultService.ts');
const context = read('context/WalletContext.tsx');
const rpc = read('backend/api/_lib/chain-rpc.ts');
const rpcRoute = read('backend/api/rpc.ts');
const health = read('backend/api/rpc-health.ts');
const balances = read('backend/api/chain-data.ts');
const history = read('backend/api/chain-history.ts');
const evmHistory = read('backend/api/history.ts');
const client = read('mobile/services/serverRpc.ts');

test('Bitcoin testnet derives coin type 1 and testnet Base58 version byte', () => {
  assert.match(derivation, /const coinType=network==='mainnet'\?0:1/);
  assert.match(derivation, /payload\[0\]=network==='mainnet'\?0x00:0x6f/);
  assert.match(wallet, /bitcoinTestnet: await deriveBitcoinAddress/);
  assert.match(vault, /deriveBitcoinAddress\(phrase, account\.accountIndex, 'testnet'\)/);
  assert.match(context, /network === 'testnet'/);
  assert.ok(context.includes('walletAddresses.bitcoinTestnet'));
});

test('Bitcoin and TRON mobile RPC requests are routed through the server gateway', () => {
  assert.match(client, /https:\/\/dexwallet-api\.vercel\.app\/api\/rpc/);
  assert.match(rpcRoute, /chain === 'bitcoin' \|\| chain === 'tron'/);
  assert.match(rpcRoute, /proxyChainRpc\(chain,network,req\.body\)/);
  assert.doesNotMatch(client, /mempool\.space|trongrid\.io|ALCHEMY_API_KEY/);
});

test('Bitcoin RPC adapter routes standard JSON-RPC through Alchemy', () => {
  assert.match(rpc, /bitcoin-mainnet/);
  assert.match(rpc, /bitcoin-testnet/);
  assert.match(rpc, /alchemyBase\('bitcoin',network\)/);
  assert.match(rpc, /sendrawtransaction/);
  assert.match(rpc, /Unsupported Bitcoin RPC method/);
});

test('TRON RPC adapter routes node methods through Alchemy', () => {
  assert.match(rpc, /tron-mainnet/);
  assert.match(rpc, /tron-testnet/);
  assert.match(rpc, /alchemyBase\('tron',network\)/);
  assert.match(health, /probeChainRpc/);
});

test('Bitcoin address history uses public Mempool.space Esplora indexing', () => {
  assert.match(history, /mempool\\.space\\/api/);
  assert.match(history, /mempool\\.space\\/testnet4\\/api/);
  assert.match(history, /blockstream\\.info\\/api/);
  assert.match(history, /blockstream\\.info\\/testnet4\\/api/);
  assert.match(history, /bitcoin_mempool_indexer_failed_using_blockstream_fallback/);
  assert.match(history, /mempool-space-esplora-indexer/);
  assert.match(history, /blockstream-esplora-fallback/);
  assert.match(history, /txs\\/chain/);
  assert.match(history, /prevout/);
});

test('Bitcoin balance remains on its configured RPC while history uses Esplora', () => {
  assert.match(balances, /bitcoin-testnet4/);
  assert.match(balances, /api\\/v2\\/address\\//);
  assert.match(history, /mempool-space-esplora-indexer/);
  assert.match(history, /blockstream-esplora-fallback/);
});

test('TRON uses Alchemy first for transaction details and falls back to TronGrid on failure', () => {
  assert.match(balances, /tron-mainnet/);
  assert.match(balances, /wallet\/getaccount/);
  assert.match(history, /\/transactions\/trc20/);
  assert.match(history, /trongrid-index/);
  assert.match(history, /tron-mainnet/);
  assert.match(history, /wallet\/gettransactionbyid/);
  assert.match(history, /walletsolidity\/gettransactioninfobyid/);
  assert.match(history, /trongrid-index\+alchemy-primary-trongrid-fallback/);
  assert.match(history, /apilist\\.tronscanapi\\.com/);
  assert.match(history, /nileapi\\.tronscan\\.org/);
  assert.match(history, /api\\/token_trc20\\/transfers/);
  assert.match(history, /tron_trongrid_indexer_failed_using_tronscan_fallback/);
  assert.match(history, /tronscan-index-fallback/);
  assert.match(history, /tronGridPost\(network, '\/wallet\/gettransactionbyid'/);
  assert.match(history, /tronGridPost\(network, '\/walletsolidity\/gettransactioninfobyid'/);
  assert.match(history, /tron_alchemy_detail_failed_using_trongrid_fallback/);
  assert.match(history, /alchemyDetailFailures/);
  assert.match(history, /tronGridDetailFallbacks/);
  assert.match(history, /Alchemy provides TRON node RPC/);
  assert.match(rpc, /tron-mainnet/);
  assert.match(rpc, /alchemyBase\('tron',network\)/);
});

test('Arbitrum is supported by the shared EVM transaction-history path', () => {
  assert.match(evmHistory, /arbitrum/);
  assert.match(evmHistory, /alchemy_getAssetTransfers/);
});

test('Asset details enables Bitcoin and TRON history instead of displaying the disabled-indexing placeholder', () => {
  const screen = read('app/asset-details.tsx');
  const client = read('mobile/services/transactionHistory.ts');
  assert.doesNotMatch(screen, /Transaction history indexing for this chain is not enabled yet/);
  assert.match(screen, /fetchIndexedChainHistory/);
  assert.match(client, /\/api\/chain-history/);

});

test('Generated HD wallet setup appends to the active vault instead of silently reusing the current account', () => {
  const setup = read('app/set-pin.tsx');
  assert.match(setup, /hasExistingAccount/);
  assert.match(setup, /addMnemonicSource\(/);
  assert.match(setup, /refreshWalletVaultStore\(\)/);
  assert.match(setup, /if \(!hasExistingAccount\)[\s\S]*?initWallet\(/);
});


test('Home wallet selector lists only accounts with a selected-chain address and assets preview is capped at five', () => {
  const home = read('app/(tabs)/home.tsx');
  assert.match(home, /vault\.accounts\.filter\(\(account\) => Boolean\(account\.addresses\[selectedBlockchain\]\?\.trim\(\)\)\)/);
  assert.match(home, /visibleTokens\.slice\(0, 5\)/);
  assert.match(home, /visibleTokens\.length - 5/);
  assert.match(home, /Number\(Boolean\(a\.contractAddress\)\) - Number\(Boolean\(b\.contractAddress\)\)/);
  assert.match(home, /View all assets/);
});

test('Full asset page keeps every token and ranks native first then by USD value', () => {
  const assets = read('app/assets.tsx');
  assert.match(assets, /tokens\.filter\(\(token\) => token\.blockchain === selectedBlockchain\)\.sort/);
  assert.match(assets, /b\.balanceUSD \|\| 0/);
  assert.doesNotMatch(assets, /visible\.slice\(0, 5\)/);
});
