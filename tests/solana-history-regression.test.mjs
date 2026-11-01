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
test('cursor maintains an independent signature position for each address',()=>{
 assert.match(api,/type CursorState = \{ v: 1; before: Record<string, string \| null> \}/);
 assert.match(api,/encodeCursor\(\{v:1,before:nextBefore\}\)/);
 assert.match(api,/nextBefore\[address\]=page\[page.length-1\]\.signature/);
});
test('token attribution falls back to discovered token account pubkeys',()=>{
 assert.match(api,/tokenAccounts\.has\(keys\[item\.accountIndex\]/);
});
test('history limits provider fan-out and reports over-limit token-account sets',()=>{
 assert.match(api,/MAX_TOKEN_ACCOUNTS = 20/);
 assert.match(api,/too_many_token_accounts/);
 assert.match(api,/TX_CONCURRENCY = 5/);
});
test('asset detail uses the backend Solana service, not direct RPC calls',()=>{
 assert.match(screen,/fetchSolanaAssetHistory/);
 assert.doesNotMatch(screen,/getSolanaRpcEndpoint/);
 assert.doesNotMatch(screen,/getSignaturesForAddress/);
 assert.match(service,/HISTORY_API='https:\/\/dexwallet-api\.vercel\.app\/api\/solana-history'/);
});
test('amount arithmetic rejects malformed raw integer strings and failed transactions remain marked',()=>{
 assert.match(api,/!\^\\d\+\$/.source|^$/); // guard below checks exact implementation tokens
 assert.match(api,/BigInt\(value\)/);
 assert.match(api,/failed\?'Failed SOL transaction'/);
 assert.match(api,/failed\?'Failed token transaction'/);
});
