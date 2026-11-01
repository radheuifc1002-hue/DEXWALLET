import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const send=read('app/send.tsx');
const balances=read('mobile/services/balanceService.ts');
const tokenImport=read('app/import-token.tsx');
const rpc=read('backend/api/_lib/rpc-manager.ts');
const limiter=read('backend/api/_lib/rate-limit.ts');
const history=read('backend/api/history.ts');
const solHistory=read('backend/api/solana-history.ts');
const assetScreen=read('app/asset-details.tsx');

test('Phase 6: wallet reads and token validation use the server RPC gateway',()=>{
  for(const source of [send,balances,tokenImport]) assert.match(source,/serverRpcRequest/);
  for(const source of [send,balances,tokenImport]) assert.doesNotMatch(source,/new ethers\.JsonRpcProvider/);
  assert.match(send,/eth_getTransactionCount/);
  assert.match(send,/eth_estimateGas/);
  assert.match(send,/eth_sendRawTransaction/);
  assert.match(send,/signTransaction\(review\.evmTx\)/);
  assert.match(send,/signSolanaMessage/);
});

test('Phase 6: private keys and mnemonic remain local; only signed bytes are broadcast',()=>{
  assert.match(send,/getMnemonic\(\)/);
  assert.match(send,/eth_sendRawTransaction/);
  assert.match(send,/sendTransaction/);
  assert.doesNotMatch(send,/JSON\.stringify\([^)]*mnemonic/i);
});

test('Phase 7: per-asset history has a hard 50-row cap and explorer navigation',()=>{
  assert.match(history,/const MAX_ROWS = 50/);
  assert.match(solHistory,/MAX_ROWS=50/);
  assert.match(assetScreen,/MAX_HISTORY = 50/);
  assert.match(assetScreen,/Linking\.openURL/);
  assert.match(history,/explorerUrl:/);
  assert.match(solHistory,/explorerUrl/);
});

test('Phase 8: bounded concurrency, short cache, coalescing and circuit-breaker are implemented',()=>{
  assert.match(rpc,/MAX_PROVIDER_CONCURRENCY = 24/);
  assert.match(rpc,/MAX_PROVIDER_REQUESTS_PER_SECOND = 40/);
  assert.match(rpc,/MAX_FAILURES = 3/);
  assert.match(rpc,/rpcCache/);
  assert.match(rpc,/rpcInflight/);
  assert.match(rpc,/CACHE_TTL/);
  assert.match(rpc,/REQUEST_TIMEOUT_MS = 18_000/);
});

test('Phase 8: RPC, history and health endpoints have request limits and secret-safe diagnostics',()=>{
  assert.match(limiter,/WINDOW_MS=60_000/);
  assert.match(limiter,/MAX_BUCKETS=5_000/);
  assert.match(read('backend/api/rpc.ts'),/consumeRateLimit/);
  assert.match(history,/consumeRateLimit/);
  assert.match(solHistory,/consumeRateLimit/);
  assert.match(read('backend/api/rpc-health.ts'),/consumeRateLimit/);
  assert.match(rpc,/rpc_provider_retry/);
  assert.doesNotMatch(rpc,/console\.(log|warn|info).*provider\.url/);
});

test('Phase 9: quality workflow runs app/backend typechecks and regression tests',()=>{
  const workflow=read('.github/workflows/mobile-quality.yml');
  assert.match(workflow,/npx tsc --noEmit/);
  assert.match(workflow,/npx tsc --noEmit -p backend\/tsconfig\.json/);
  assert.match(workflow,/node --test tests\/\*\.test\.mjs/);
});

test('Supported chain configuration remains limited to the four agreed chains',()=>{
  const context=read('context/WalletContext.tsx');
  assert.match(context,/export type Blockchain = 'solana' \| 'ethereum' \| 'bnb' \| 'polygon'/);
});

test('Phase 6: mobile and server network configuration share the canonical API host',()=>{
  const client=read('mobile/services/serverRpc.ts');
  const config=read('backend/api/rpc-config.ts');
  const mobileConfig=read('mobile/services/rpcManager.ts');
  assert.match(client,/https:\/\/dexwallet-api\.vercel\.app/);
  assert.match(config,/https:\/\/dexwallet-api\.vercel\.app/);
  assert.match(mobileConfig,/https:\/\/dexwallet-api\.vercel\.app/);
});

test('Operational documentation distinguishes active probes from process-local state',()=>{
  const readme=read('backend/README.md');
  assert.match(readme,/actively probes configured providers/);
  assert.match(readme,/process-local/);
  assert.match(readme,/5,000-user capacity guarantee/);
});
