import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const api=readFileSync(new URL('../backend/api/solana-history.ts',import.meta.url),'utf8');
const screen=readFileSync(new URL('../app/asset-details.tsx',import.meta.url),'utf8');
const service=readFileSync(new URL('../mobile/services/solanaHistory.ts',import.meta.url),'utf8');
test('SPL history discovers mint-owned token accounts and queries each address',()=>{
 assert.match(api,/getTokenAccountsByOwner/);
 assert.match(api,/const addresses=\[wallet,\.\.\.tokenAccounts\]/);
 assert.match(api,/getSignaturesForAddress/);
});
test('cursor maintains independent per-address positions and does not skip unconsumed rows',()=>{
 assert.match(api,/type CursorState = \{ v: 1; before: Record<string, string \| null> \}/);
 assert.match(api,/encodeCursor\(\{v:1,before:nextBefore\}\)/);
 assert.match(api,/const used=page\.filter\(item=>consumed\.has\(item\.signature\)\)/);
 assert.match(api,/used\[used\.length-1\]\.signature/);
});
test('token attribution falls back to discovered token-account pubkeys',()=>{
 assert.match(api,/tokenAccounts\.has\(keys\[item\.accountIndex\]/);
});
test('provider fan-out is bounded and oversized account sets fail explicitly',()=>{
 assert.match(api,/MAX_TOKEN_ACCOUNTS = 20/);
 assert.match(api,/too_many_token_accounts/);
 assert.match(api,/TX_CONCURRENCY = 5/);
});
test('asset detail uses backend Solana history rather than direct RPC',()=>{
 assert.match(screen,/fetchSolanaAssetHistory/);
 assert.doesNotMatch(screen,/getSolanaRpcEndpoint/);
 assert.doesNotMatch(screen,/getSignaturesForAddress/);
 assert.match(service,/HISTORY_API='https:\/\/dexwallet-api\.vercel\.app\/api\/solana-history'/);
});
test('raw amounts use strict integer parsing and failed transactions are surfaced',()=>{
 assert.ok(api.includes("typeof value !== 'string' || !/^\\d+$/.test(value)"));
 assert.match(api,/BigInt\(value\)/);
 assert.match(api,/failed\?'Failed SOL transaction'/);
 assert.match(api,/failed\?'Failed token transaction'/);
});
test('SOL lamport arithmetic rejects values that cannot be represented exactly',()=>{
 assert.match(api,/Number\.isSafeInteger\(preValue\)/);
 assert.match(api,/unsafe_lamport_value/);
});
