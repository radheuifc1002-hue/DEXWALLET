import { neon } from '@neondatabase/serverless';
import { createHash, randomUUID } from 'node:crypto';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const sql = neon(databaseUrl);
const workerId = process.env.WORKER_ID || 'dexwallet-indexer-' + randomUUID();
const pollMs = Math.max(1000, Number(process.env.INDEXER_POLL_INTERVAL_MS || 2500));
const pageTimeoutMs = 15000;
const hosts = {
  'ethereum:mainnet': 'https://eth.blockscout.com/api/v2',
  'ethereum:testnet': 'https://eth-sepolia.blockscout.com/api/v2',
  'polygon:mainnet': 'https://polygon.blockscout.com/api/v2',
};
const nativeSymbols = { ethereum: 'ETH', polygon: 'POL', bnb: 'BNB' };
const SOL_NATIVE_MINT = 'native:SOL';
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_PROGRAMS = new Set([
  '11111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  'ComputeBudget111111111111111111111111111111',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const iso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const addressHash = (value) => String(value?.hash || value || '').toLowerCase();
const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const blockNumber = (row) => asNumber(row.block_number ?? row.block?.number ?? row.block, 0);
const txStatus = (row) => {
  const status = String(row.status || row.result || '').toLowerCase();
  if (['ok', 'success', 'confirmed'].includes(status)) return 'success';
  if (['error', 'failed', 'reverted'].includes(status)) return 'failed';
  return 'unknown';
};
const txType = (row) => {
  if (row.method || row.decoded_input || row.transaction_types?.includes?.('contract_call')) return 'contract_interaction';
  if (!row.to?.hash && !row.to) return 'other';
  return 'transfer';
};

async function fetchJson(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pageTimeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'DEXWALLET-Indexer/1.0', ...extraHeaders },
      signal: controller.signal,
    });
    if (!response.ok) {
      const retryHeader = response.headers.get('retry-after');
      const retrySeconds = retryHeader ? Number(retryHeader) : 0;
      const error = new Error('History provider HTTP ' + response.status);
      error.retryAfterMs = Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000 : undefined;
      throw error;
    }
    const json = await response.json();
    if (!json || !Array.isArray(json.items)) throw new Error('EVM history provider response shape invalid');
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function pageUrl(base, address, suffix, params) {
  const url = new URL(base + '/addresses/' + encodeURIComponent(address) + '/' + suffix);
  if (suffix === 'token-transfers') url.searchParams.set('type', 'ERC-20');
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function upsertTransaction(chain, network, row) {
  const hash = String(row.hash || row.transaction_hash || '').toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(hash)) return 0;
  const from = addressHash(row.from);
  const to = addressHash(row.to);
  const block = blockNumber(row) || null;
  const timestamp = iso(row.timestamp);
  const value = String(row.value ?? '0');
  const gasUsed = row.gas_used == null ? null : String(row.gas_used);
  const gasPrice = row.gas_price == null ? null : String(row.gas_price);
  const fee = row.fee?.value == null ? null : String(row.fee.value);
  const nonce = row.nonce == null ? null : String(row.nonce);
  const confirmations = Math.max(0, asNumber(row.confirmations));
  const status = txStatus(row);
  const type = txType(row);
  const sourceProvider = chain === 'bnb' || (chain === 'polygon' && network === 'testnet') ? 'etherscan_v2' : 'blockscout';
  await sql`
    INSERT INTO public.indexed_transactions
      (chain, network, tx_hash, block_number, block_hash, transaction_index,
       block_timestamp, from_address, to_address, value_raw, value_decimals,
       asset_symbol, tx_status, tx_type, gas_used, gas_price_raw, fee_raw, nonce,
       explorer_url, source_provider, confirmations, is_final, last_seen_at)
    VALUES
      (${chain}, ${network}, ${hash}, ${block}, ${row.block_hash || null},
       ${row.transaction_index == null ? null : asNumber(row.transaction_index)},
       ${timestamp}, ${from || null}, ${to || null}, ${value}, 18,
       ${nativeSymbols[chain] || 'ETH'}, ${status}, ${type}, ${gasUsed},
       ${gasPrice}, ${fee}, ${nonce},
       ${chain === 'ethereum' ? (network === 'mainnet' ? 'https://etherscan.io/tx/' : 'https://sepolia.etherscan.io/tx/') : chain === 'bnb' ? (network === 'mainnet' ? 'https://bscscan.com/tx/' : 'https://testnet.bscscan.com/tx/') : (network === 'mainnet' ? 'https://polygonscan.com/tx/' : 'https://amoy.polygonscan.com/tx/')} || ${hash},
       ${sourceProvider}, ${confirmations}, FALSE, NOW())
    ON CONFLICT (chain, network, tx_hash) DO UPDATE SET
      block_number = COALESCE(EXCLUDED.block_number, indexed_transactions.block_number),
      block_hash = COALESCE(EXCLUDED.block_hash, indexed_transactions.block_hash),
      block_timestamp = COALESCE(EXCLUDED.block_timestamp, indexed_transactions.block_timestamp),
      from_address = COALESCE(EXCLUDED.from_address, indexed_transactions.from_address),
      to_address = COALESCE(EXCLUDED.to_address, indexed_transactions.to_address),
      value_raw = CASE WHEN EXCLUDED.value_raw <> 0 THEN EXCLUDED.value_raw ELSE indexed_transactions.value_raw END,
      tx_status = CASE WHEN EXCLUDED.tx_status <> 'unknown' THEN EXCLUDED.tx_status ELSE indexed_transactions.tx_status END,
      tx_type = CASE
        WHEN EXCLUDED.tx_type = 'contract_interaction' THEN 'contract_interaction'
        WHEN indexed_transactions.tx_type IN ('other', 'token_transfer') THEN EXCLUDED.tx_type
        ELSE indexed_transactions.tx_type
      END,
      gas_used = COALESCE(EXCLUDED.gas_used, indexed_transactions.gas_used),
      gas_price_raw = COALESCE(EXCLUDED.gas_price_raw, indexed_transactions.gas_price_raw),
      fee_raw = COALESCE(EXCLUDED.fee_raw, indexed_transactions.fee_raw),
      confirmations = GREATEST(indexed_transactions.confirmations, EXCLUDED.confirmations),
      is_final = indexed_transactions.is_final OR EXCLUDED.is_final,
      last_seen_at = NOW()
  `;
  return block || 0;
}

async function upsertTokenTransfer(chain, network, row) {
  const hash = String(row.transaction_hash || row.tx_hash || '').toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(hash)) return 0;
  const token = row.token || {};
  const from = addressHash(row.from);
  const to = addressHash(row.to);
  const tokenAddress = addressHash(token.address || row.token_address);
  const eventIndex = asNumber(row.log_index ?? row.logIndex ?? row.index, -1);
  if (!tokenAddress || !from || !to || eventIndex < 0) return 0;
  const block = asNumber(row.block_number, 0) || null;
  const timestamp = iso(row.timestamp);
  const amount = String(row.total?.value ?? row.value ?? '0');
  const decimals = Math.max(0, Math.min(36, asNumber(token.decimals ?? row.token_decimals, 18)));
  const sourceProvider = chain === 'bnb' || (chain === 'polygon' && network === 'testnet') ? 'etherscan_v2' : 'blockscout';
  await sql`
    INSERT INTO public.indexed_transactions
      (chain, network, tx_hash, block_number, block_timestamp, from_address, to_address,
       value_raw, value_decimals, asset_symbol, tx_status, tx_type, source_provider)
    VALUES (${chain}, ${network}, ${hash}, ${block}, ${timestamp}, ${from}, ${to},
       0, 18, ${nativeSymbols[chain] || 'ETH'}, 'unknown', 'token_transfer', ${sourceProvider})
    ON CONFLICT (chain, network, tx_hash) DO UPDATE SET
      block_number = COALESCE(indexed_transactions.block_number, EXCLUDED.block_number),
      block_timestamp = COALESCE(indexed_transactions.block_timestamp, EXCLUDED.block_timestamp),
      from_address = COALESCE(indexed_transactions.from_address, EXCLUDED.from_address),
      to_address = COALESCE(indexed_transactions.to_address, EXCLUDED.to_address),
      last_seen_at = NOW()
  `;
  await sql`
    INSERT INTO public.indexed_token_transfers
      (chain, network, tx_hash, event_index, token_address, token_symbol, token_name,
       token_decimals, from_address, to_address, amount_raw, block_number,
       block_timestamp, source_provider)
    VALUES (${chain}, ${network}, ${hash}, ${eventIndex}, ${tokenAddress},
       ${token.symbol || null}, ${token.name || null}, ${decimals}, ${from}, ${to},
       ${amount}, ${block}, ${timestamp}, ${sourceProvider})
    ON CONFLICT (chain, network, tx_hash, event_index) DO UPDATE SET
      token_symbol = COALESCE(EXCLUDED.token_symbol, indexed_token_transfers.token_symbol),
      token_name = COALESCE(EXCLUDED.token_name, indexed_token_transfers.token_name),
      amount_raw = EXCLUDED.amount_raw,
      block_timestamp = COALESCE(EXCLUDED.block_timestamp, indexed_token_transfers.block_timestamp),
      indexed_at = NOW()
  `;
  return block || 0;
}


async function fetchEtherscanV2Page(address, chain, network, action, page) {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) throw new Error('ETHERSCAN_API_KEY is required for BNB and Polygon Amoy indexing');
  const chainId = chain === 'bnb' ? (network === 'mainnet' ? 56 : 97) : 80002;
  const url = new URL('https://api.etherscan.io/v2/api');
  for (const [key, value] of Object.entries({
    chainid: chainId, module: 'account', action, address,
    startblock: 0, endblock: 99999999, page, offset: 50, sort: 'desc', apikey: apiKey,
  })) url.searchParams.set(key, String(value));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pageTimeoutMs);
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'DEXWALLET-Indexer/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) {
      const retryHeader = response.headers.get('retry-after');
      const retrySeconds = retryHeader ? Number(retryHeader) : 0;
      const error = new Error('Etherscan V2 HTTP ' + response.status);
      error.retryAfterMs = Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000 : undefined;
      throw error;
    }
    const payload = await response.json();
    if (Array.isArray(payload?.result)) {
      const items = payload.result.map((row) => {
        if (action === 'tokentx') {
          return {
            transaction_hash: row.hash,
            block_number: Number(row.blockNumber || 0),
            timestamp: row.timeStamp ? new Date(Number(row.timeStamp) * 1000).toISOString() : null,
            from: { hash: row.from },
            to: { hash: row.to },
            token: {
              address: row.contractAddress,
              symbol: row.tokenSymbol,
              name: row.tokenName,
              decimals: Number(row.tokenDecimal || 18),
            },
            log_index: Number(row.logIndex || 0),
            value: row.value,
          };
        }
        let fee = null;
        try { fee = (BigInt(String(row.gasUsed || 0)) * BigInt(String(row.gasPrice || 0))).toString(); } catch {}
        return {
          hash: row.hash,
          block_number: Number(row.blockNumber || 0),
          block_hash: row.blockHash || null,
          transaction_index: Number(row.transactionIndex || 0),
          timestamp: row.timeStamp ? new Date(Number(row.timeStamp) * 1000).toISOString() : null,
          from: { hash: row.from },
          to: row.to ? { hash: row.to } : null,
          value: row.value,
          gas_used: row.gasUsed,
          gas_price: row.gasPrice,
          fee: fee === null ? null : { value: fee },
          nonce: row.nonce,
          confirmations: Number(row.confirmations || 0),
          status: String(row.isError || '0') === '1' || String(row.txreceipt_status || '1') === '0' ? 'error' : 'ok',
          method: row.functionName || (row.methodId && row.methodId !== '0x' ? row.methodId : null),
        };
      });
      return { items, next_page_params: items.length === 50 ? { page: page + 1 } : null };
    }
    const message = String(payload?.result || payload?.message || '');
    if (payload?.status === '0' && /no transactions found|no records found|no data found/i.test(message)) {
      return { items: [], next_page_params: null };
    }
    throw new Error('Etherscan V2 rejected ' + action + ': ' + (message || 'unexpected response'));
  } finally {
    clearTimeout(timer);
  }
}

async function claimJob() {
  const jobs = await sql`
    UPDATE public.indexer_jobs
    SET status = 'running', attempts = attempts + 1, locked_at = NOW(),
        locked_by = ${workerId}, updated_at = NOW()
    WHERE id = (
      SELECT id FROM public.indexer_jobs
      WHERE (status IN ('queued', 'retry') AND available_at <= NOW())
         OR (status = 'running' AND locked_at < NOW() - INTERVAL '5 minutes')
      ORDER BY priority ASC, available_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;
  return jobs[0] || null;
}

async function processJob(job) {
  const chain = String(job.chain);
  const network = String(job.network);
  const address = String(job.address_key);
  const base = hosts[chain + ':' + network];
  const usesEtherscanV2 = chain === 'bnb' || (chain === 'polygon' && network === 'testnet');
  if (chain !== 'solana' && !usesEtherscanV2 && !base) throw new Error('No approved indexed-history adapter for this network');
  if (usesEtherscanV2 && !process.env.ETHERSCAN_API_KEY) throw new Error('ETHERSCAN_API_KEY is required for BNB and Polygon Amoy indexing');

  const states = await sql`
    SELECT last_indexed_block, cursor FROM public.address_sync_state
    WHERE chain = ${chain} AND network = ${network} AND address_key = ${address}
    LIMIT 1
  `;
  const syncState = states[0];
  if (!syncState) throw new Error('Address sync state missing');
  await sql`
    UPDATE public.address_sync_state
    SET sync_status = 'syncing', lease_owner = ${workerId},
        lease_expires_at = NOW() + INTERVAL '5 minutes', updated_at = NOW()
    WHERE chain = ${chain} AND network = ${network} AND address_key = ${address}
  `;

  if (chain === 'solana') return processSolanaJob(job, address, syncState);

  let cursor;
  try { cursor = job.cursor ? JSON.parse(job.cursor) : null; } catch { cursor = null; }
  const stopBlock = job.job_type === 'incremental_sync'
    ? asNumber(syncState.last_indexed_block, 0) || null
    : null;
  cursor = cursor || {
    stopBlock,
    transactions: { done: false, params: null },
    tokenTransfers: { done: false, params: null },
  };

  const txPage = cursor.transactions.done
    ? { items: [], next_page_params: null }
    : usesEtherscanV2
      ? await fetchEtherscanV2Page(address, chain, network, 'txlist', Number(cursor.transactions.params?.page || 1))
      : await fetchJson(pageUrl(base, address, 'transactions', cursor.transactions.params));
  const tokenPage = cursor.tokenTransfers.done
    ? { items: [], next_page_params: null }
    : usesEtherscanV2
      ? await fetchEtherscanV2Page(address, chain, network, 'tokentx', Number(cursor.tokenTransfers.params?.page || 1))
      : await fetchJson(pageUrl(base, address, 'token-transfers', cursor.tokenTransfers.params));

  let highestBlock = asNumber(syncState.last_indexed_block, 0);
  let txReachedStop = false;
  let tokenReachedStop = false;

  for (const row of txPage.items) {
    const block = await upsertTransaction(chain, network, row);
    highestBlock = Math.max(highestBlock, block);
    // Continue through the complete boundary block. Stopping at <= would
    // truncate other transactions sharing the last indexed block.
    if (stopBlock && block > 0 && block < stopBlock) txReachedStop = true;
  }
  for (const row of tokenPage.items) {
    const block = await upsertTokenTransfer(chain, network, row);
    highestBlock = Math.max(highestBlock, block);
    if (stopBlock && block > 0 && block < stopBlock) tokenReachedStop = true;
  }

  cursor.transactions = {
    done: txReachedStop || !txPage.next_page_params,
    params: txReachedStop ? null : (txPage.next_page_params || null),
  };
  cursor.tokenTransfers = {
    done: tokenReachedStop || !tokenPage.next_page_params,
    params: tokenReachedStop ? null : (tokenPage.next_page_params || null),
  };

  const done = cursor.transactions.done && cursor.tokenTransfers.done;
  const nextCursor = JSON.stringify(cursor);
  await sql`
    UPDATE public.address_sync_state
    SET cursor = ${done ? null : nextCursor},
        last_indexed_block = GREATEST(COALESCE(last_indexed_block, 0), ${highestBlock}),
        last_indexed_at = NOW(),
        sync_status = ${done ? 'idle' : 'syncing'},
        last_error_category = NULL,
        lease_owner = NULL, lease_expires_at = NULL,
        updated_at = NOW()
    WHERE chain = ${chain} AND network = ${network} AND address_key = ${address}
  `;

  if (!done) {
    const digest = createHash('sha256').update(nextCursor).digest('hex').slice(0, 20);
    const jobKey = String(job.job_key) + ':' + digest;
    await sql`
      INSERT INTO public.indexer_jobs
        (job_key, job_type, chain, network, address_key, cursor, status, priority, max_attempts)
      VALUES (${jobKey}, ${job.job_type}, ${chain}, ${network}, ${address}, ${nextCursor}, 'queued', 50, 8)
      ON CONFLICT (job_key) DO NOTHING
    `;
  }

  await sql`
    INSERT INTO public.api_metric_events (service, operation, chain, network, outcome, provider_key)
    VALUES ('indexer', ${job.job_type}, ${chain}, ${network}, 'success', ${chain === 'bnb' || (chain === 'polygon' && network === 'testnet') ? 'etherscan_v2' : 'blockscout'})
  `;
  await sql`
    UPDATE public.indexer_jobs
    SET status = 'succeeded', locked_at = NULL, locked_by = NULL, updated_at = NOW()
    WHERE id = ${job.id} AND locked_by = ${workerId}
  `;
}


async function heliusRpc(network, method, address, options) {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) throw new Error('HELIUS_API_KEY is required for Solana indexing');
  const cluster = network === 'mainnet' ? 'mainnet' : 'devnet';
  const url = 'https://' + cluster + '.helius-rpc.com/?api-key=' + encodeURIComponent(apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pageTimeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'dexwallet-indexer', method, params: [address, options] }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const retryHeader = response.headers.get('retry-after');
      const retrySeconds = retryHeader ? Number(retryHeader) : 0;
      const error = new Error('Helius HTTP ' + response.status);
      error.retryAfterMs = Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000 : undefined;
      throw error;
    }
    const payload = await response.json();
    if (payload?.error) throw new Error('Helius RPC error: ' + String(payload.error.message || payload.error.code || 'unknown'));
    const result = payload?.result;
    if (!result || !Array.isArray(result.data)) throw new Error('Helius response shape invalid for ' + method);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function upsertSolanaTransaction(network, wallet, row) {
  const signature = String(row.signature || row.transaction?.signatures?.[0] || '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature)) return 0;
  const slot = asNumber(row.slot, 0);
  const blockTime = asNumber(row.blockTime ?? row.block_time, 0);
  const timestamp = blockTime > 0 ? new Date(blockTime * 1000).toISOString() : null;
  const meta = row.meta || row.transaction?.meta || {};
  const message = row.transaction?.message || row.message || {};
  const accountKeys = (message.accountKeys || []).map((key) => typeof key === 'string' ? key : String(key?.pubkey || ''));
  const instructions = Array.isArray(message.instructions) ? message.instructions : [];
  const programIds = instructions.map((instruction) =>
    instruction.programId || accountKeys[Number(instruction.programIdIndex)] || ''
  ).filter(Boolean);
  const contractProgram = programIds.find((programId) => !SOL_PROGRAMS.has(programId)) || null;
  const status = meta.err ? 'failed' : 'success';
  const txType = contractProgram ? 'contract_interaction' : 'other';
  await sql`
    INSERT INTO public.indexed_transactions
      (chain, network, tx_hash, block_number, block_timestamp, from_address, to_address,
       value_raw, value_decimals, asset_symbol, tx_status, tx_type, fee_raw,
       explorer_url, source_provider, confirmations, is_final, last_seen_at)
    VALUES ('solana', ${network}, ${signature}, ${slot || null}, ${timestamp},
      ${wallet}, ${contractProgram}, 0, 9, 'SOL', ${status}, ${txType},
      ${meta.fee == null ? null : String(meta.fee)},
      ${'https://explorer.solana.com/tx/' + signature + (network === 'devnet' ? '?cluster=devnet' : '')},
      'helius', ${row.confirmationStatus === 'finalized' ? 1 : 0},
      ${row.confirmationStatus === 'finalized'}, NOW())
    ON CONFLICT (chain, network, tx_hash) DO UPDATE SET
      block_number = COALESCE(EXCLUDED.block_number, indexed_transactions.block_number),
      block_timestamp = COALESCE(EXCLUDED.block_timestamp, indexed_transactions.block_timestamp),
      from_address = COALESCE(indexed_transactions.from_address, EXCLUDED.from_address),
      to_address = COALESCE(EXCLUDED.to_address, indexed_transactions.to_address),
      tx_status = EXCLUDED.tx_status,
      tx_type = CASE WHEN EXCLUDED.tx_type = 'contract_interaction' THEN EXCLUDED.tx_type ELSE indexed_transactions.tx_type END,
      fee_raw = COALESCE(EXCLUDED.fee_raw, indexed_transactions.fee_raw),
      confirmations = GREATEST(indexed_transactions.confirmations, EXCLUDED.confirmations),
      is_final = indexed_transactions.is_final OR EXCLUDED.is_final,
      last_seen_at = NOW()
  `;
  return slot;
}

async function upsertSolanaTransfer(network, wallet, row) {
  const signature = String(row.signature || '');
  const from = String(row.fromUserAccount || '');
  const to = String(row.toUserAccount || '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature) || !from || !to) return 0;
  const mint = String(row.mint || '');
  const native = !mint || mint === WRAPPED_SOL_MINT;
  const tokenAddress = native ? SOL_NATIVE_MINT : mint;
  const slot = asNumber(row.slot, 0);
  const blockTime = asNumber(row.blockTime, 0);
  const timestamp = blockTime > 0 ? new Date(blockTime * 1000).toISOString() : null;
  const instructionIndex = asNumber(row.instructionIdx, 0);
  const innerInstructionIndex = asNumber(row.innerInstructionIdx, 0);
  const eventIndex = instructionIndex * 1000 + innerInstructionIndex;
  const amount = String(row.amount ?? row.amountRaw ?? '0');
  const decimals = Math.max(0, Math.min(36, asNumber(row.decimals, native ? 9 : 0)));
  const eventType = String(row.type || 'transfer');
  if (eventType !== 'transfer') return 0;

  await sql`
    INSERT INTO public.indexed_transactions
      (chain, network, tx_hash, block_number, block_timestamp, from_address, to_address,
       value_raw, value_decimals, asset_symbol, tx_status, tx_type, source_provider,
       explorer_url, last_seen_at)
    VALUES ('solana', ${network}, ${signature}, ${slot || null}, ${timestamp},
      ${from}, ${to}, 0, 9, 'SOL', 'success', 'token_transfer', 'helius',
      ${'https://explorer.solana.com/tx/' + signature + (network === 'devnet' ? '?cluster=devnet' : '')}, NOW())
    ON CONFLICT (chain, network, tx_hash) DO UPDATE SET
      block_number = COALESCE(indexed_transactions.block_number, EXCLUDED.block_number),
      block_timestamp = COALESCE(indexed_transactions.block_timestamp, EXCLUDED.block_timestamp),
      tx_type = CASE WHEN indexed_transactions.tx_type = 'other' THEN 'token_transfer' ELSE indexed_transactions.tx_type END,
      last_seen_at = NOW()
  `;
  await sql`
    INSERT INTO public.indexed_token_transfers
      (chain, network, tx_hash, event_index, token_address, token_symbol, token_name,
       token_decimals, from_address, to_address, amount_raw, block_number,
       block_timestamp, source_provider)
    VALUES ('solana', ${network}, ${signature}, ${eventIndex}, ${tokenAddress},
      ${native ? 'SOL' : (row.symbol || row.tokenSymbol || 'SPL')},
      ${native ? 'Solana' : (row.name || row.tokenName || null)}, ${decimals},
      ${from}, ${to}, ${amount}, ${slot || null}, ${timestamp}, 'helius')
    ON CONFLICT (chain, network, tx_hash, event_index) DO UPDATE SET
      token_address = EXCLUDED.token_address,
      token_symbol = COALESCE(EXCLUDED.token_symbol, indexed_token_transfers.token_symbol),
      token_name = COALESCE(EXCLUDED.token_name, indexed_token_transfers.token_name),
      amount_raw = EXCLUDED.amount_raw,
      block_timestamp = COALESCE(EXCLUDED.block_timestamp, indexed_token_transfers.block_timestamp),
      indexed_at = NOW()
  `;
  return slot;
}

async function processSolanaJob(job, address, syncState) {
  const network = String(job.network);
  const stopSlot = job.job_type === 'incremental_sync'
    ? asNumber(syncState.last_indexed_block, 0) || null
    : null;
  let cursor;
  try { cursor = job.cursor ? JSON.parse(job.cursor) : null; } catch { cursor = null; }
  cursor = cursor || {
    stopSlot,
    transactions: { done: false, token: null },
    transfers: { done: false, token: null },
  };

  const [transactionPage, transferPage] = await Promise.all([
    cursor.transactions.done
      ? Promise.resolve({ data: [], paginationToken: null })
      : heliusRpc(network, 'getTransactionsForAddress', address, {
          transactionDetails: 'full',
          sortOrder: 'desc',
          limit: 100,
          filters: { tokenAccounts: 'balanceChanged' },
          ...(cursor.transactions.token ? { paginationToken: cursor.transactions.token } : {}),
        }),
    cursor.transfers.done
      ? Promise.resolve({ data: [], paginationToken: null })
      : heliusRpc(network, 'getTransfersByAddress', address, {
          limit: 100,
          sortOrder: 'desc',
          solMode: 'merged',
          ...(cursor.transfers.token ? { paginationToken: cursor.transfers.token } : {}),
        }),
  ]);

  let highestSlot = asNumber(syncState.last_indexed_block, 0);
  let transactionsReachedStop = false;
  let transfersReachedStop = false;

  for (const row of transactionPage.data) {
    const slot = await upsertSolanaTransaction(network, address, row);
    highestSlot = Math.max(highestSlot, slot);
    if (stopSlot && slot > 0 && slot < stopSlot) transactionsReachedStop = true;
  }
  for (const row of transferPage.data) {
    const slot = await upsertSolanaTransfer(network, address, row);
    highestSlot = Math.max(highestSlot, slot);
    if (stopSlot && slot > 0 && slot < stopSlot) transfersReachedStop = true;
  }

  cursor.transactions = {
    done: transactionsReachedStop || !transactionPage.paginationToken,
    token: transactionsReachedStop ? null : (transactionPage.paginationToken || null),
  };
  cursor.transfers = {
    done: transfersReachedStop || !transferPage.paginationToken,
    token: transfersReachedStop ? null : (transferPage.paginationToken || null),
  };
  const done = cursor.transactions.done && cursor.transfers.done;
  const nextCursor = JSON.stringify(cursor);
  await sql`
    UPDATE public.address_sync_state
    SET cursor = ${done ? null : nextCursor},
        last_indexed_block = GREATEST(COALESCE(last_indexed_block, 0), ${highestSlot}),
        last_indexed_at = NOW(), sync_status = ${done ? 'idle' : 'syncing'},
        last_error_category = NULL, lease_owner = NULL, lease_expires_at = NULL,
        updated_at = NOW()
    WHERE chain = 'solana' AND network = ${network} AND address_key = ${address}
  `;

  if (!done) {
    const digest = createHash('sha256').update(nextCursor).digest('hex').slice(0, 20);
    await sql`
      INSERT INTO public.indexer_jobs
        (job_key, job_type, chain, network, address_key, cursor, status, priority, max_attempts)
      VALUES (${String(job.job_key) + ':' + digest}, ${job.job_type}, 'solana', ${network},
        ${address}, ${nextCursor}, 'queued', 50, 8)
      ON CONFLICT (job_key) DO NOTHING
    `;
  }

  await sql`
    INSERT INTO public.api_metric_events (service, operation, chain, network, outcome, provider_key)
    VALUES ('indexer', ${job.job_type}, 'solana', ${network}, 'success', 'helius')
  `;
  await sql`
    UPDATE public.indexer_jobs
    SET status = 'succeeded', locked_at = NULL, locked_by = NULL, updated_at = NOW()
    WHERE id = ${job.id} AND locked_by = ${workerId}
  `;
}

async function failJob(job, error) {
  const retryMs = Math.max(
    Number(error?.retryAfterMs || 0),
    Math.min(15 * 60 * 1000, 5000 * Math.pow(2, Math.max(0, Number(job.attempts || 1) - 1)))
  );
  const dead = Number(job.attempts || 0) >= Number(job.max_attempts || 8);
  await sql`
    UPDATE public.indexer_jobs
    SET status = ${dead ? 'dead_letter' : 'retry'},
        available_at = NOW() + (${Math.ceil(retryMs / 1000)} || ' seconds')::interval,
        locked_at = NULL, locked_by = NULL,
        last_error_category = ${String(error?.message || 'indexer_error').slice(0, 80)},
        updated_at = NOW()
    WHERE id = ${job.id} AND locked_by = ${workerId}
  `;
  if (dead) {
    await sql`
      UPDATE public.address_sync_state
      SET sync_status = 'failed', last_error_category = 'provider_or_worker_failure',
          lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
      WHERE chain = ${job.chain} AND network = ${job.network} AND address_key = ${job.address_key}
    `;
  } else {
    await sql`
      UPDATE public.address_sync_state
      SET sync_status = 'degraded', last_error_category = 'temporary_provider_failure',
          lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
      WHERE chain = ${job.chain} AND network = ${job.network} AND address_key = ${job.address_key}
    `;
  }
  await sql`
    INSERT INTO public.api_metric_events (service, operation, chain, network, outcome, provider_key, error_category)
    VALUES ('indexer', ${job.job_type}, ${job.chain}, ${job.network},
      ${dead ? 'error' : 'timeout'}, ${job.chain === 'solana' ? 'helius' : job.chain === 'bnb' || (job.chain === 'polygon' && job.network === 'testnet') ? 'etherscan_v2' : 'blockscout'}, 'provider_or_worker_failure')
  `;
}


let indexedNetworks = [];
let lastJobFailureAt = 0;

async function writeWorkerHeartbeat(jobCompleted = false) {
  const degraded = Date.now() - lastJobFailureAt < 60000;
  await sql`
    INSERT INTO public.indexer_worker_heartbeats
      (worker_id, status, version, chains, started_at, last_seen_at, last_job_at, last_error_category, updated_at)
    VALUES (${workerId}, ${degraded ? 'degraded' : 'running'}, '1.1.0',
      ${JSON.stringify(indexedNetworks)}::jsonb, NOW(), NOW(),
      ${jobCompleted ? new Date().toISOString() : null}, ${degraded ? 'recent_job_failure' : null}, NOW())
    ON CONFLICT (worker_id) DO UPDATE SET
      status = EXCLUDED.status,
      version = EXCLUDED.version,
      chains = EXCLUDED.chains,
      last_seen_at = NOW(),
      last_job_at = CASE WHEN ${jobCompleted} THEN NOW() ELSE indexer_worker_heartbeats.last_job_at END,
      last_error_category = EXCLUDED.last_error_category,
      updated_at = NOW()
  `;
}


async function validateProviderNetworks() {
  const available = [];
  const zeroAddress = '0x0000000000000000000000000000000000000000';
  for (const [networkKey, base] of Object.entries(hosts)) {
    try {
      await fetchJson(pageUrl(base, zeroAddress, 'transactions', null));
      await fetchJson(pageUrl(base, zeroAddress, 'token-transfers', null));
      available.push(networkKey);
    } catch (error) {
      console.error(JSON.stringify({ service: 'dexwallet-indexer', event: 'provider_smoke_failed', network: networkKey, provider: 'blockscout', category: String(error?.message || 'unknown').slice(0, 80) }));
    }
  }

  if (process.env.ETHERSCAN_API_KEY) {
    for (const [chain, network] of [['bnb', 'mainnet'], ['bnb', 'testnet'], ['polygon', 'testnet']]) {
      try {
        await fetchEtherscanV2Page(zeroAddress, chain, network, 'txlist', 1);
        await fetchEtherscanV2Page(zeroAddress, chain, network, 'tokentx', 1);
        available.push(chain + ':' + network);
      } catch (error) {
        console.error(JSON.stringify({ service: 'dexwallet-indexer', event: 'provider_smoke_failed', network: chain + ':' + network, provider: 'etherscan_v2', category: String(error?.message || 'unknown').slice(0, 80) }));
      }
    }
  }

  if (process.env.HELIUS_API_KEY) {
    const systemAddress = '11111111111111111111111111111111';
    for (const network of ['mainnet', 'devnet']) {
      try {
        await heliusRpc(network, 'getTransactionsForAddress', systemAddress, {
          transactionDetails: 'full', sortOrder: 'desc', limit: 1,
        });
        await heliusRpc(network, 'getTransfersByAddress', systemAddress, {
          limit: 1, sortOrder: 'desc', solMode: 'merged',
        });
        available.push('solana:' + network);
      } catch (error) {
        console.error(JSON.stringify({ service: 'dexwallet-indexer', event: 'provider_smoke_failed', network: 'solana:' + network, provider: 'helius', category: String(error?.message || 'unknown').slice(0, 80) }));
      }
    }
  }

  indexedNetworks = available.sort();
}

async function main() {
  await validateProviderNetworks();
  console.log(JSON.stringify({ service: 'dexwallet-indexer', event: 'started', workerId, pollMs, indexedNetworks }));
  let lastCleanup = 0;
  let lastHeartbeat = 0;
  while (true) {
    try {
      if (Date.now() - lastHeartbeat >= 15000) {
        await writeWorkerHeartbeat(false);
        lastHeartbeat = Date.now();
      }
      const job = await claimJob();
      if (!job) {
        if (Date.now() - lastCleanup > 5 * 60 * 1000) {
          await sql`DELETE FROM public.api_rate_limits WHERE expires_at < NOW()`;
          lastCleanup = Date.now();
        }
        await sleep(pollMs);
        continue;
      }
      try {
        await processJob(job);
        lastJobFailureAt = 0;
        await writeWorkerHeartbeat(true);
        lastHeartbeat = Date.now();
        console.log(JSON.stringify({ service: 'dexwallet-indexer', event: 'job_succeeded', jobId: job.id, chain: job.chain, network: job.network }));
      } catch (error) {
        await failJob(job, error);
        lastJobFailureAt = Date.now();
        await writeWorkerHeartbeat(false).catch(() => {});
        lastHeartbeat = Date.now();
        console.error(JSON.stringify({ service: 'dexwallet-indexer', event: 'job_failed', jobId: job.id, chain: job.chain, network: job.network, category: String(error?.message || 'unknown').slice(0, 80) }));
      }
    } catch (error) {
      lastJobFailureAt = Date.now();
      await writeWorkerHeartbeat(false).catch(() => {});
      lastHeartbeat = Date.now();
      console.error(JSON.stringify({ service: 'dexwallet-indexer', event: 'poll_failed', category: String(error?.message || 'unknown').slice(0, 80) }));
      await sleep(Math.min(30000, pollMs * 4));
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ service: 'dexwallet-indexer', event: 'fatal', category: String(error?.message || 'unknown').slice(0, 100) }));
  process.exitCode = 1;
});
