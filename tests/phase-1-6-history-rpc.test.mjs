import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const history=readFileSync(new URL('../backend/api/history.ts',import.meta.url),'utf8');
const rpc=readFileSync(new URL('../backend/api/_lib/rpc-manager.ts',import.meta.url),'utf8');
const rpcRoute=readFileSync(new URL('../backend/api/rpc.ts',import.meta.url),'utf8');
const health=readFileSync(new URL('../backend/api/rpc-health.ts',import.meta.url),'utf8');
const screen=readFileSync(new URL('../app/asset-details.tsx',import.meta.url),'utf8');
const mobile=readFileSync(new URL('../mobile/services/transactionHistory.ts',import.meta.url),'utf8');

test('supported networks include all seven enabled chains with mainnet/testnet routes',()=>{
  assert.match(rpc,/export type RpcChain = 'ethereum' \\| 'bnb' \\| 'polygon' \\| 'arbitrum' \\| 'solana' \\| 'bitcoin' \\| 'tron'/);
  assert.match(rpcRoute,/bitcoin/);
  assert.match(rpcRoute,/tron/);
  assert.match(rpc,/eth-sepolia/);
  assert.match(rpc,/bnb-testnet/);
  assert.match(rpc,/polygon-amoy/);
  assert.match(rpc,/solana-devnet/);
  assert.match(rpc,/arb-mainnet/);
  assert.match(rpc,/bitcoin-mainnet/);
  assert.match(rpc,/tron-mainnet/);
});

test('Alchemy asset transfers use the documented singular category field',()=>{
  assert.match(history,/category:\[category\]/);
  assert.doesNotMatch(history,/categories:/);
  assert.match(history,/method:'alchemy_getAssetTransfers'/);
});

test('EVM asset history queries only outgoing and incoming native or ERC-20 transfers',()=>{
  assert.match(history,/transfers\(chain,network,wallet,'from',category/);
  assert.match(history,/transfers\(chain,network,wallet,'to',category/);
  assert.match(history,/category=isNative\?'external':'erc20'/);
  assert.match(history,/Internal traces and generic contract calls are out of scope/);
  assert.doesNotMatch(history,/debug_trace|trace_filter|alchemy_getAssetTransfers.*internal/);
});

test('EVM history paginates Alchemy pageKey and returns at most 50 newest asset transfers',()=>{
  assert.match(history,/pageKey/);
  assert.match(history,/MAX_TRANSFER_PAGES/);
  assert.match(history,/TRANSFER_PAGE_SIZE = 100/);
  assert.match(history,/const MAX_ROWS = 50/);
  assert.match(history,/slice\(0,limit\)/);
});

test('receipt lookup distinguishes success, failure and unknown instead of assuming success',()=>{
  assert.match(history,/status==='0x0'\)return 'failed'/);
  assert.match(history,/status==='0x1'\)return 'success'/);
  assert.match(history,/status:'unknown'/);
  assert.match(history,/status==='failed'/);
});

test('mobile history surfaces unverified status and backend completeness',()=>{
  assert.match(mobile,/complete:boolean/);
  assert.match(mobile,/status: 'success'\|'failed'\|'unknown'/);
  assert.match(screen,/Unverified/);
  assert.match(screen,/historyWarning/);
});

test('Solana history pagination is wired to an explicit load older action',()=>{
  assert.match(screen,/before: append \? cursor/);
  assert.match(screen,/history\.nextBefore/);
  assert.match(screen,/Load older transactions/);
});

test('RPC health route actively probes configured providers',()=>{
  assert.match(rpc,/probeRpcProviders/);
  assert.match(health,/probeRpcProviders/);
  assert.match(health,/probeChainRpc/);
  assert.match(health,/status:healthy\\?'healthy'/);
});

test('native DApp browser uses the central EVM gateway and contains no public RPC endpoints',()=>{
  const browser=readFileSync(new URL('../app/(tabs)/browser.tsx',import.meta.url),'utf8');
  assert.match(browser,/getCentralRpcUrl/);
  assert.match(browser,/getCentralEvmChainId/);
  assert.doesNotMatch(browser,/publicnode\.com|bsc-dataseed|polygon-rpc\.com/);
});

test('multiple same-asset transfer logs in one transaction are aggregated by direction',()=>{
  assert.match(history,/const grouped=new Map<string/);
  assert.match(history,/current\.rawValue\+=rawValue/);
  assert.match(history,/current\.fallbackValue\+=fallbackValue/);
});
