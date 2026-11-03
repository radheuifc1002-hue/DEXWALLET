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

test('Bitcoin RPC adapter uses mainnet and Testnet4 services, with signed broadcast only', () => {
  assert.match(rpc, /https:\/\/mempool\.space\/api/);
  assert.match(rpc, /https:\/\/mempool\.space\/testnet4\/api/);
  assert.match(rpc, /sendrawtransaction/);
  assert.match(rpc, /Unsupported Bitcoin RPC method/);
});

test('TRON RPC adapter uses TronGrid mainnet and Nile, and probes the actual provider', () => {
  assert.match(rpc, /https:\/\/api\.trongrid\.io/);
  assert.match(rpc, /https:\/\/nile\.trongrid\.io/);
  assert.match(rpc, /TRON-PRO-API-KEY/);
  assert.match(health, /probeChainRpc/);
});

test('Bitcoin balances and history use network-specific indexed APIs', () => {
  assert.match(balances, /mempool\.space\/testnet4\/api/);
  assert.match(balances, /chain_stats/);
  assert.ok(history.includes("'/address/'") && history.includes("'/txs'"));
  assert.match(history, /mempool-space/);
});

test('TRON balance and native plus TRC20 history use TronGrid indexed APIs', () => {
  assert.match(balances, /\/v1\/accounts\//);
  assert.match(history, /\/transactions\/trc20/);
  assert.match(history, /trongrid-v1/);
  assert.match(history, /ownerHex/);
});

test('Arbitrum is supported by the shared EVM transaction-history path', () => {
  assert.match(evmHistory, /arbitrum/);
  assert.match(evmHistory, /alchemy_getAssetTransfers/);
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
