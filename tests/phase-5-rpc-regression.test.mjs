import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const ctx=readFileSync(new URL('../context/WalletContext.tsx',import.meta.url),'utf8'),manager=readFileSync(new URL('../backend/api/_lib/rpc-manager.ts',import.meta.url),'utf8'),balanceService=readFileSync(new URL('../mobile/services/balanceService.ts',import.meta.url),'utf8'),webBalance=readFileSync(new URL('../web-app/app/services/balanceService.ts',import.meta.url),'utf8'),client=readFileSync(new URL('../mobile/services/serverRpc.ts',import.meta.url),'utf8'),send=readFileSync(new URL('../app/send.tsx',import.meta.url),'utf8'),imp=readFileSync(new URL('../app/import-token.tsx',import.meta.url),'utf8');
test('gateway rejects unknown RPC methods and permits only signed broadcast writes',()=>{assert.match(manager,/SIGNED_BROADCAST_METHODS = new Set\(\['eth_sendRawTransaction','sendTransaction'\]\)/);assert.match(manager,/if \(!allRead && !allSignedBroadcast\) return null/);});
test('signed broadcast requests are primary-provider only',()=>{assert.match(manager,/providers = parsed.readOnly \? all : all.slice\(0,1\)/);});
test('mobile RPC client targets central gateway and has no provider credentials',()=>{assert.match(client,/https:\/\/dexwallet-api\.vercel\.app\/api\/rpc/);assert.doesNotMatch(client,/alchemy\.com|chainstack|RPC_FALLBACK/);});
test('send flow routes reads and signed broadcasts through central RPC',()=>{assert.match(send,/serverRpcRequest/);assert.match(send,/eth_sendRawTransaction/);assert.match(send,/signTransaction\(review\.evmTx\)/);assert.doesNotMatch(send,/new ethers\.JsonRpcProvider/);assert.doesNotMatch(send,/withEvmReadFallback|withSolanaReadFallback|getSolanaRpcEndpoint/);});
test('token import routes SPL and EVM reads through central RPC',()=>{assert.match(imp,/serverRpcRequest/);assert.match(imp,/eth_getCode/);assert.match(imp,/eth_call/);assert.doesNotMatch(imp,/new ethers\.JsonRpcProvider/);assert.doesNotMatch(imp,/getSolanaRpcEndpoint|getEvmRpcConfig/);});

test('Solana fee estimation and signature confirmation reads are allowlisted',()=>{assert.match(manager,/'getFeeForMessage'/);assert.match(manager,/'getSignatureStatuses'/);});
test('RPC manager retries primary HTTP authorization failures through configured read fallback',()=>{assert.match(manager,/status === 401 \\|\\| status === 403/);});
test('send flow preserves submitted transaction hash before confirmation polling',()=>{assert.match(send,/submittedHash = txHash;/);assert.match(send,/setHash\(txHash\);/);assert.match(send,/setReview\(null\);/);assert.match(send,/Transaction was submitted, but confirmation could not be verified/);});
test('wallet balances use central RPC for native and imported assets',()=>{assert.match(ctx,/refreshWalletTokenBalances/);assert.match(balanceService,/serverRpcRequest/);assert.doesNotMatch(balanceService,/new ethers\.JsonRpcProvider/);assert.match(balanceService,/getTokenAccountsByOwner/);});
test('web balance service contains no direct public RPC URLs',()=>{assert.doesNotMatch(webBalance,/llamarpc|bsc-dataseed|polygon-rpc\\.com|mainnet-beta\\.solana\\.com/);});

const btcHistoryClient=readFileSync(new URL('../mobile/services/transactionHistory.ts',import.meta.url),'utf8');
const btcHistoryApi=readFileSync(new URL('../backend/api/chain-history.ts',import.meta.url),'utf8');
test('Bitcoin history API request from Android client matches server contract and parses API response',()=>{
  const clientCall=btcHistoryClient.slice(btcHistoryClient.indexOf('export async function fetchIndexedChainHistory'));
  assert.match(clientCall,/fetch\('https:\/\/dexwallet-api\.vercel\.app\/api\/chain-history'/);
  assert.match(clientCall,/method: 'POST'/);
  assert.match(clientCall,/chain: options\.chain,[\s\S]*?network: options\.network,[\s\S]*?walletAddress: options\.walletAddress\.trim\(\)/);
  assert.match(clientCall,/if \(!response\.ok\)/);
  assert.match(clientCall,/if \(!Array\.isArray\(payload\?\.rows\)\)/);
  assert.match(clientCall,/rows: payload\.rows[\s\S]*?complete: Boolean\(payload\.complete\)/);
  assert.match(btcHistoryApi,/chain, network, walletAddress: address, rows, limit: 50,[\s\S]*?complete: rows\.length < 50, source: 'alchemy-utxo-indexer'/);
  assert.match(btcHistoryApi,/history_provider_unavailable/);
});
