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
  assert.match(historyApi, /SUPPORTED_INDEXED_NETWORKS = new Set\(\['ethereum:mainnet', 'ethereum:testnet', 'polygon:mainnet'\]\)/);
  assert.doesNotMatch(historyApi, /ALLOWED_CHAINS = new Set\(\['ethereum', 'polygon', 'bnb'\]\)/);
});
