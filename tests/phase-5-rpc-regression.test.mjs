import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const manager=readFileSync(new URL('../backend/api/_lib/rpc-manager.ts',import.meta.url),'utf8'),client=readFileSync(new URL('../mobile/services/serverRpc.ts',import.meta.url),'utf8'),send=readFileSync(new URL('../app/send.tsx',import.meta.url),'utf8'),imp=readFileSync(new URL('../app/import-token.tsx',import.meta.url),'utf8');
test('gateway rejects unknown RPC methods and permits only signed broadcast writes',()=>{assert.match(manager,/SIGNED_BROADCAST_METHODS = new Set\(\['eth_sendRawTransaction','sendTransaction'\]\)/);assert.match(manager,/if \(!allRead && !allSignedBroadcast\) return null/);});
test('signed broadcast requests are primary-provider only',()=>{assert.match(manager,/providers = parsed.readOnly \? all : all.slice\(0,1\)/);});
test('mobile RPC client targets central gateway and has no provider credentials',()=>{assert.match(client,/https:\/\/dexwallet-api\.vercel\.app\/api\/rpc/);assert.doesNotMatch(client,/alchemy\.com|chainstack|RPC_FALLBACK/);});
test('send flow routes reads and signed broadcasts through central RPC',()=>{assert.match(send,/serverRpcRequest/);assert.match(send,/getCentralRpcUrl/);assert.doesNotMatch(send,/withEvmReadFallback|withSolanaReadFallback|getSolanaRpcEndpoint/);});
test('token import routes SPL and EVM reads through central RPC',()=>{assert.match(imp,/serverRpcRequest/);assert.match(imp,/getCentralRpcUrl/);assert.doesNotMatch(imp,/getSolanaRpcEndpoint|getEvmRpcConfig/);});

test('Solana fee estimation and signature confirmation reads are allowlisted',()=>{assert.match(manager,/'getFeeForMessage'/);assert.match(manager,/'getSignatureStatuses'/);});
test('RPC manager retries primary HTTP authorization failures through configured read fallback',()=>{assert.match(manager,/status === 401 \|\| status === 403/);});
test('send flow preserves submitted transaction hash before confirmation polling',()=>{assert.match(send,/submittedHash = txHash;\s*setHash\(txHash\);\s*setReview\(null\)/);assert.match(send,/Transaction was submitted, but confirmation could not be verified/);});
test('wallet balances use central RPC for native and imported assets',()=>{assert.match(ctx,/refreshWalletTokenBalances/);assert.match(balanceService,/getCentralRpcUrl/);assert.match(balanceService,/getTokenAccountsByOwner/);});
test('web balance service contains no direct public RPC URLs',()=>{assert.doesNotMatch(webBalance,/llamarpc|bsc-dataseed|polygon-rpc\.com|mainnet-beta\.solana\.com/);});
