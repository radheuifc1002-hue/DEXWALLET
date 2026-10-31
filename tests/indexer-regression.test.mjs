import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../backend/indexer/worker.mjs', import.meta.url), 'utf8');
const historyApi = readFileSync(new URL('../backend/api/indexed-history.ts', import.meta.url), 'utf8');
const registerApi = readFileSync(new URL('../backend/api/indexer/register-address.ts', import.meta.url), 'utf8');
const mobileHistory = readFileSync(new URL('../mobile/services/transactionHistory.ts', import.meta.url), 'utf8');
const historyScreen = readFileSync(new URL('../app/transaction-history.tsx', import.meta.url), 'utf8');
const readyApi = readFileSync(new URL('../backend/api/ready.ts', import.meta.url), 'utf8');

test('native transaction upsert promotes token-only placeholders and contract calls', () => {
  assert.match(worker, /WHEN EXCLUDED\.tx_type = 'contract_interaction' THEN 'contract_interaction'/);
  assert.match(worker, /indexed_transactions\.tx_type IN \('other', 'token_transfer'\) THEN EXCLUDED\.tx_type/);
});

test('incremental sync processes the complete last-indexed boundary block', () => {
  assert.match(worker, /block < stopBlock\) txReachedStop = true/);
  assert.match(worker, /block < stopBlock\) tokenReachedStop = true/);
  assert.doesNotMatch(worker, /block <= stopBlock\)/);
});

test('indexed-history requests schedule stale incremental refresh without hiding cached rows', () => {
  assert.match(historyApi, /staleAfterMs = 5 \* 60 \* 1000/);
  assert.match(historyApi, /\['idle', 'degraded'\]\.includes\(String\(sync\.sync_status\)\)/);
  assert.match(historyApi, /status IN \('queued', 'running', 'retry'\)/);
  assert.match(historyApi, /'incremental_sync'/);
  assert.match(historyApi, /const nativeRows = isNative/);
});

test('re-enrolling an indexed address does not restart a full initial sync', () => {
  assert.match(registerApi, /const initial = !state\.last_indexed_at/);
  assert.match(registerApi, /state\.sync_status !== 'syncing'/);
});

test('keyset pagination distinguishes native rows and token log events at the same hash', () => {
  assert.match(historyApi, /cursor\?\.rowType === 'token'/);
  assert.match(historyApi, /tr\.event_index < \$\{cursor\?\.eventIndex/);
  assert.match(historyApi, /_eventIndex - a\._eventIndex/);
});

test('indexed-history only advertises networks with a configured worker', () => {
  assert.match(historyApi, /'polygon:testnet', 'bnb:mainnet', 'bnb:testnet', 'solana:mainnet', 'solana:devnet'/);
  assert.match(registerApi, /chain === 'bnb'.*chain === 'solana'/s);
});

test('BNB mainnet and testnet use Etherscan V2 with chain IDs 56 and 97', () => {
  assert.match(worker, /ETHERSCAN_API_KEY is required for BNB and Polygon Amoy indexing/);
  assert.match(worker, /chainId = chain === 'bnb' \? \(network === 'mainnet' \? 56 : 97\) : 80002/);
  assert.match(worker, /chain === 'polygon' && network === 'testnet'/);
  assert.match(worker, /https:\/\/api\.etherscan\.io\/v2\/api/);
  assert.match(worker, /fetchEtherscanV2Page\(address, chain, network, 'txlist'/);
  assert.match(worker, /fetchEtherscanV2Page\(address, chain, network, 'tokentx'/);
});

test('Solana mainnet and devnet use Helius address history and transfer pagination', () => {
  assert.match(worker, /HELIUS_API_KEY is required for Solana indexing/);
  assert.match(worker, /getTransactionsForAddress/);
  assert.match(worker, /getTransfersByAddress/);
  assert.match(worker, /validateProviderNetworks/);
  assert.match(worker, /provider_smoke_failed/);
  assert.match(worker, /tokenAccounts: 'balanceChanged'/);
  assert.match(worker, /paginationToken/);
  assert.match(worker, /SOL_NATIVE_MINT = 'native:SOL'/);
});

test('Solana wallet addresses and transaction signatures preserve base58 case', () => {
  assert.match(registerApi, /\[1-9A-HJ-NP-Za-km-z\]\{32,44\}/);
  assert.match(historyApi, /\[1-9A-HJ-NP-Za-km-z\]\{32,100\}/);
  assert.match(historyApi, /const addressKey = isSolana \? wallet : wallet\.toLowerCase\(\)/);
});

test('mobile wallet history uses the isolated API and keeps device-direct fallback', () => {
  assert.match(mobileHistory, /dexwallet-api-radheuifc1002-2100s-projects\.vercel\.app/);
  assert.match(mobileHistory, /isIndexedHistoryEnabled/);
  assert.match(mobileHistory, /Server history is an optimization, never a hard dependency/);
  assert.match(historyScreen, /fetchIndexedWalletHistoryPage/);
  assert.match(historyScreen, /indexedPage\.nextCursor/);
});

test('API readiness requires a live worker and all mainnet/testnet indexer targets', () => {
  assert.match(worker, /indexer_worker_heartbeats/);
  assert.match(worker, /last_seen_at = NOW\(\)/);
  assert.match(readyApi, /REQUIRED_INDEXED_NETWORKS/);
  assert.match(readyApi, /'polygon:testnet'/);
  assert.match(readyApi, /'bnb:testnet'/);
  assert.match(readyApi, /'solana:devnet'/);
  assert.match(worker, /\['bnb', 'mainnet'\], \['bnb', 'testnet'\], \['polygon', 'testnet'\]/);
  assert.match(readyApi, /last_seen_at/);
});
