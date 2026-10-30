import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../backend/indexer/worker.mjs', import.meta.url), 'utf8');
const historyApi = readFileSync(new URL('../backend/api/indexed-history.ts', import.meta.url), 'utf8');
const registerApi = readFileSync(new URL('../backend/api/indexer/register-address.ts', import.meta.url), 'utf8');

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
  assert.match(historyApi, /'bnb:mainnet', 'bnb:testnet', 'solana:mainnet', 'solana:devnet'/);
  assert.match(registerApi, /chain === 'bnb'.*chain === 'solana'/s);
});

test('BNB mainnet and testnet use the Routescan Blockscout adapter with server-side API key', () => {
  assert.match(worker, /'bnb:mainnet': 'https:\/\/blockscout\.routescan\.io\/56\/api\/v2'/);
  assert.match(worker, /'bnb:testnet': 'https:\/\/blockscout\.routescan\.io\/97\/api\/v2'/);
  assert.match(worker, /ROUTESCAN_API_KEY is required for BNB indexing/);
  assert.match(worker, /'x-api-key': process\.env\.ROUTESCAN_API_KEY/);
});

test('Solana mainnet and devnet use Helius address history and transfer pagination', () => {
  assert.match(worker, /HELIUS_API_KEY is required for Solana indexing/);
  assert.match(worker, /getTransactionsForAddress/);
  assert.match(worker, /getTransfersByAddress/);
  assert.match(worker, /tokenAccounts: 'balanceChanged'/);
  assert.match(worker, /paginationToken/);
  assert.match(worker, /SOL_NATIVE_MINT = 'native:SOL'/);
});

test('Solana wallet addresses and transaction signatures preserve base58 case', () => {
  assert.match(registerApi, /\[1-9A-HJ-NP-Za-km-z\]\{32,44\}/);
  assert.match(historyApi, /\[1-9A-HJ-NP-Za-km-z\]\{32,100\}/);
  assert.match(historyApi, /const addressKey = isSolana \? wallet : wallet\.toLowerCase\(\)/);
});
