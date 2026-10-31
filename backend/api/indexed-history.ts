import { neon } from '@neondatabase/serverless';
import { createHmac, randomUUID } from 'node:crypto';

type Request = { method?: string; body?: unknown; headers?: Record<string, string | string[] | undefined> };
type Response = {
  setHeader(name: string, value: string): void;
  status(code: number): Response;
  json(value: unknown): void;
  end(): void;
};

const SUPPORTED_INDEXED_NETWORKS = new Set(['ethereum:mainnet', 'ethereum:testnet', 'polygon:mainnet', 'polygon:testnet', 'bnb:mainnet', 'bnb:testnet', 'solana:mainnet', 'solana:devnet']);
const MAX_LIMIT = 50;
const RATE_LIMIT_PER_MINUTE = 60;

function sendError(res: Response, status: number, code: string, requestId: string) {
  res.status(status).json({ error: { code, requestId } });
}

function parseBody(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    if (body.length > 4096) return null;
    try { body = JSON.parse(body); } catch { return null; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (JSON.stringify(body).length > 4096) return null;
  return body as Record<string, unknown>;
}

function encodeCursor(timestamp: string, hash: string, rowType: 'native' | 'token', eventIndex: number) {
  return Buffer.from(JSON.stringify({ timestamp, hash, rowType, eventIndex }), 'utf8').toString('base64url');
}

function decodeCursor(value: unknown): { timestamp: string; hash: string; rowType: 'native' | 'token'; eventIndex: number } | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed.timestamp !== 'string' || !Number.isFinite(Date.parse(parsed.timestamp))) return null;
    if (typeof parsed.hash !== 'string' || !(/^0x[a-fA-F0-9]{64}$/.test(parsed.hash) || /^[1-9A-HJ-NP-Za-km-z]{32,100}$/.test(parsed.hash))) return null;
    if (!['native', 'token'].includes(parsed.rowType) || !Number.isInteger(parsed.eventIndex)) return null;
    return {
      timestamp: new Date(parsed.timestamp).toISOString(),
      hash: /^0x/.test(parsed.hash) ? parsed.hash.toLowerCase() : parsed.hash,
      rowType: parsed.rowType,
      eventIndex: parsed.eventIndex,
    };
  } catch { return null; }
}

function formatRaw(rawValue: unknown, decimalsValue: unknown): string {
  try {
    const raw = BigInt(String(rawValue ?? '0'));
    const decimals = Math.max(0, Math.min(36, Number(decimalsValue ?? 18)));
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const fraction = (raw % divisor).toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
    return fraction ? whole.toString() + '.' + fraction : whole.toString();
  } catch { return '0'; }
}

function explorerPrefix(chain: string, network: string) {
  if (chain === 'ethereum') return network === 'mainnet' ? 'https://etherscan.io/tx/' : 'https://sepolia.etherscan.io/tx/';
  if (chain === 'polygon') return network === 'mainnet' ? 'https://polygonscan.com/tx/' : 'https://amoy.polygonscan.com/tx/';
  if (chain === 'bnb') return network === 'mainnet' ? 'https://bscscan.com/tx/' : 'https://testnet.bscscan.com/tx/';
  return network === 'mainnet' ? 'https://explorer.solana.com/tx/' : 'https://explorer.solana.com/tx/';
}

async function enforceRateLimit(req: Request) {
  const secret = process.env.API_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new Error('RATE_LIMIT_NOT_CONFIGURED');
  const realIp = req.headers?.['x-real-ip'];
  const forwarded = req.headers?.['x-forwarded-for'];
  const ip = (typeof realIp === 'string' && realIp) ||
    (typeof forwarded === 'string' ? forwarded.split(',').pop()?.trim() : '') || 'unknown';
  const minute = Math.floor(Date.now() / 60000);
  const bucketKey = createHmac('sha256', secret).update(ip + ':' + minute).digest('hex');
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    INSERT INTO public.api_rate_limits (bucket_key, request_count, window_started_at, expires_at)
    VALUES (${bucketKey}, 1, to_timestamp(${minute * 60}), to_timestamp(${(minute + 2) * 60}))
    ON CONFLICT (bucket_key)
    DO UPDATE SET request_count = public.api_rate_limits.request_count + 1
    RETURNING request_count
  `;
  const firstRow = (rows as unknown as Array<{ request_count: number }>)[0];
  return Number(firstRow?.request_count || 0) <= RATE_LIMIT_PER_MINUTE;
}

function mapTransaction(row: any, wallet: string, chain: string, network: string) {
  const from = String(row.from_address || '');
  const to = String(row.to_address || '');
  const incoming = chain === 'solana' ? from !== wallet : from.toLowerCase() !== wallet.toLowerCase();
  const hash = String(row.tx_hash || '');
  const symbol = String(row.asset_symbol || (chain === 'ethereum' ? 'ETH' : chain === 'polygon' ? 'POL' : chain === 'solana' ? 'SOL' : 'BNB'));
  const timestamp = Math.floor(new Date(row.activity_time).getTime() / 1000);
  const failed = row.tx_status === 'failed';
  const contractInteraction = row.tx_type === 'contract_interaction';
  return {
    id: hash + ':native',
    hash,
    title: contractInteraction ? 'Contract interaction' : (chain === 'solana' && row.tx_type === 'other' ? 'Solana transaction' : (incoming ? 'Received ' : 'Sent ') + symbol),
    detail: contractInteraction
      ? 'Contract interaction · ' + (incoming ? 'From ' : 'To ') + (incoming ? from : to).slice(0, 10) + '…' + (incoming ? from : to).slice(-6)
      : chain === 'solana' && row.tx_type === 'other' ? 'Solana on-chain activity'
      : (incoming ? 'From ' : 'To ') + (incoming ? from : to).slice(0, 10) + '…' + (incoming ? from : to).slice(-6),
    amount: contractInteraction || (chain === 'solana' && row.tx_type === 'other') ? '' : formatRaw(row.value_raw, row.value_decimals) + ' ' + symbol,
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
    incoming,
    failed,
    explorerUrl: explorerPrefix(chain, network) + hash + (chain === 'solana' && network === 'devnet' ? '?cluster=devnet' : ''),
    _sortTime: new Date(row.activity_time).getTime(),
    _rowType: 'native',
    _eventIndex: -1,
  };
}

function mapTokenTransfer(row: any, wallet: string, chain: string, network: string) {
  const from = String(row.from_address || '');
  const to = String(row.to_address || '');
  const incoming = chain === 'solana' ? from !== wallet : from.toLowerCase() !== wallet.toLowerCase();
  const hash = String(row.tx_hash || '');
  const nativeSol = chain === 'solana' && row.token_address === 'native:SOL';
  const symbol = nativeSol ? 'SOL' : String(row.token_symbol || 'TOKEN');
  const timestamp = Math.floor(new Date(row.activity_time).getTime() / 1000);
  return {
    id: hash + ':token:' + String(row.event_index),
    hash,
    title: nativeSol ? (incoming ? 'Received SOL' : 'Sent SOL') : 'Token ' + (incoming ? 'received' : 'sent'),
    detail: symbol + ' · ' + (incoming ? 'From ' : 'To ') + (incoming ? from : to).slice(0, 10) + '…' + (incoming ? from : to).slice(-6),
    amount: formatRaw(row.amount_raw, row.token_decimals) + ' ' + symbol,
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
    incoming,
    failed: row.tx_status === 'failed',
    explorerUrl: explorerPrefix(chain, network) + hash + (chain === 'solana' && network === 'devnet' ? '?cluster=devnet' : ''),
    _sortTime: new Date(row.activity_time).getTime(),
    _rowType: 'token',
    _eventIndex: Number(row.event_index),
  };
}

export default async function handler(req: Request, res: Response) {
  const requestId = randomUUID();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    sendError(res, 405, 'method_not_allowed', requestId);
    return;
  }

  const body = parseBody(req.body);
  if (!body) { sendError(res, 400, 'invalid_request_body', requestId); return; }

  const chain = String(body.chain || '').toLowerCase();
  const network = String(body.network || '').toLowerCase();
  const wallet = String(body.walletAddress || '');
  const isNative = body.isNative !== false;
  const contract = String(body.contractAddress || '');
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit || MAX_LIMIT)));
  const cursor = body.cursor == null ? null : decodeCursor(body.cursor);

  if (!SUPPORTED_INDEXED_NETWORKS.has(chain + ':' + network)) {
    sendError(res, 400, 'unsupported_chain_or_network', requestId); return;
  }
  const isSolana = chain === 'solana';
  const validAddress = isSolana ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet) : /^0x[a-fA-F0-9]{40}$/.test(wallet);
  if (!validAddress) {
    sendError(res, 400, 'invalid_wallet_address', requestId); return;
  }
  const validContract = isSolana ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(contract) : /^0x[a-fA-F0-9]{40}$/.test(contract);
  if (!isNative && !validContract) {
    sendError(res, 400, 'invalid_token_contract', requestId); return;
  }
  if (!Number.isInteger(limit) || limit < 1 || (body.cursor != null && !cursor)) {
    sendError(res, 400, 'invalid_pagination', requestId); return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) { sendError(res, 503, 'database_not_configured', requestId); return; }
  const sql = neon(databaseUrl);
  try {
    if (!(await enforceRateLimit(req))) {
      res.setHeader('Retry-After', '60');
      sendError(res, 429, 'rate_limit_exceeded', requestId);
      return;
    }

    const addressKey = isSolana ? wallet : wallet.toLowerCase();
    const syncRows = await sql`
      SELECT sync_status, last_indexed_at, last_indexed_block, cursor
      FROM public.address_sync_state
      WHERE chain = ${chain} AND network = ${network} AND address_key = ${addressKey}
      LIMIT 1
    `;
    const sync = (syncRows as unknown as Array<{
      sync_status: string;
      last_indexed_at: string | null;
      last_indexed_block: number | null;
      cursor: string | null;
    }>)[0];
    if (!sync || !sync.last_indexed_at || !['idle', 'degraded', 'syncing'].includes(String(sync.sync_status))) {
      res.status(200).json({ indexed: false, rows: [], nextCursor: null, requestId });
      return;
    }

    // Refresh an indexed address when it is requested after the freshness
    // window. The active-job check prevents every app refresh from creating
    // another provider job. Cached history is still served while it runs.
    const lastIndexedAt = new Date(sync.last_indexed_at).getTime();
    const staleAfterMs = 5 * 60 * 1000;
    if (
      Number.isFinite(lastIndexedAt) &&
      Date.now() - lastIndexedAt >= staleAfterMs &&
      ['idle', 'degraded'].includes(String(sync.sync_status))
    ) {
      const activeJobs = await sql`
        SELECT id FROM public.indexer_jobs
        WHERE chain = ${chain} AND network = ${network} AND address_key = ${addressKey}
          AND status IN ('queued', 'running', 'retry')
        LIMIT 1
      `;
      if (activeJobs.length === 0) {
        const bucketId = Math.floor(Date.now() / staleAfterMs);
        const jobKey = 'incremental_sync:' + chain + ':' + network + ':' + addressKey + ':' + bucketId;
        await sql`
          INSERT INTO public.indexer_jobs
            (job_key, job_type, chain, network, address_key, cursor, status, priority, max_attempts)
          VALUES (${jobKey}, 'incremental_sync', ${chain}, ${network}, ${addressKey}, NULL, 'queued', 50, 8)
          ON CONFLICT (job_key) DO NOTHING
        `;
      }
    }

    const nativeRows = isNative
      ? await sql`
          SELECT tx_hash, from_address, to_address, value_raw::text, value_decimals,
                 asset_symbol, tx_status, tx_type,
                 COALESCE(block_timestamp, first_seen_at) AS activity_time
          FROM public.indexed_transactions
          WHERE chain = ${chain} AND network = ${network}
            AND (($chain = 'solana' AND (from_address = ${addressKey} OR to_address = ${addressKey})) OR ($chain <> 'solana' AND (lower(from_address) = ${addressKey} OR lower(to_address) = ${addressKey})))
            AND (
              ${cursor?.timestamp || null}::timestamptz IS NULL
              OR COALESCE(block_timestamp, first_seen_at) < ${cursor?.timestamp || null}::timestamptz
              OR (COALESCE(block_timestamp, first_seen_at) = ${cursor?.timestamp ?? null}::timestamptz AND tx_hash < ${cursor?.hash || ''})
              OR (COALESCE(block_timestamp, first_seen_at) = ${cursor?.timestamp ?? null}::timestamptz AND tx_hash = ${cursor?.hash || ''} AND ${cursor?.rowType === 'token'})
            )
            AND tx_type <> 'token_transfer'
          ORDER BY COALESCE(block_timestamp, first_seen_at) DESC, tx_hash DESC
          LIMIT ${limit + 1}
        `
      : await sql`
          SELECT tx_hash, from_address, to_address, value_raw::text, value_decimals,
                 asset_symbol, tx_status, tx_type,
                 COALESCE(block_timestamp, first_seen_at) AS activity_time
          FROM public.indexed_transactions
          WHERE chain = ${chain} AND network = ${network}
            AND (($chain = 'solana' AND (from_address = ${addressKey} OR to_address = ${addressKey})) OR ($chain <> 'solana' AND (lower(from_address) = ${addressKey} OR lower(to_address) = ${addressKey})))
            AND (($chain = 'solana' AND (from_address = ${contract} OR to_address = ${contract})) OR ($chain <> 'solana' AND (lower(from_address) = ${contract.toLowerCase()} OR lower(to_address) = ${contract.toLowerCase()})))
            AND tx_type = 'contract_interaction'
            AND (
              ${cursor?.timestamp || null}::timestamptz IS NULL
              OR COALESCE(block_timestamp, first_seen_at) < ${cursor?.timestamp || null}::timestamptz
              OR (COALESCE(block_timestamp, first_seen_at) = ${cursor?.timestamp ?? null}::timestamptz AND tx_hash < ${cursor?.hash || ''})
              OR (COALESCE(block_timestamp, first_seen_at) = ${cursor?.timestamp ?? null}::timestamptz AND tx_hash = ${cursor?.hash || ''} AND ${cursor?.rowType === 'token'})
            )
          ORDER BY COALESCE(block_timestamp, first_seen_at) DESC, tx_hash DESC
          LIMIT ${limit + 1}
        `;

    const tokenRows = isNative && chain !== 'solana' ? [] : await sql`
      SELECT tr.tx_hash, tr.event_index, tr.token_address, tr.from_address, tr.to_address,
             tr.token_symbol, tr.token_decimals, tr.amount_raw::text,
             COALESCE(tr.block_timestamp, tx.block_timestamp, tx.first_seen_at) AS activity_time,
             tx.tx_status
      FROM public.indexed_token_transfers tr
      JOIN public.indexed_transactions tx
        ON tx.chain = tr.chain AND tx.network = tr.network AND tx.tx_hash = tr.tx_hash
      WHERE tr.chain = ${chain} AND tr.network = ${network}
        AND (($chain = 'solana' AND tr.token_address = ${isNative ? 'native:SOL' : contract}) OR ($chain <> 'solana' AND lower(tr.token_address) = ${contract.toLowerCase()}))
        AND (($chain = 'solana' AND (tr.from_address = ${addressKey} OR tr.to_address = ${addressKey})) OR ($chain <> 'solana' AND (lower(tr.from_address) = ${addressKey} OR lower(tr.to_address) = ${addressKey})))
        AND (
          ${cursor?.timestamp || null}::timestamptz IS NULL
          OR COALESCE(tr.block_timestamp, tx.block_timestamp, tx.first_seen_at) < ${cursor?.timestamp || null}::timestamptz
          OR (COALESCE(tr.block_timestamp, tx.block_timestamp, tx.first_seen_at) = ${cursor?.timestamp ?? null}::timestamptz AND tr.tx_hash < ${cursor?.hash || ''})
          OR (COALESCE(tr.block_timestamp, tx.block_timestamp, tx.first_seen_at) = ${cursor?.timestamp ?? null}::timestamptz AND tr.tx_hash = ${cursor?.hash || ''} AND (${cursor?.rowType === 'token'} AND tr.event_index < ${cursor?.eventIndex ?? -1}))
        )
      ORDER BY COALESCE(tr.block_timestamp, tx.block_timestamp, tx.first_seen_at) DESC, tr.tx_hash DESC, tr.event_index DESC
      LIMIT ${limit + 1}
    `;

    const mapped = [
      ...nativeRows.map((row: any) => mapTransaction(row, wallet, chain, network)),
      ...tokenRows.map((row: any) => mapTokenTransfer(row, wallet, chain, network)),
    ].sort((a: any, b: any) => b._sortTime - a._sortTime || b.hash.localeCompare(a.hash) || b._eventIndex - a._eventIndex);

    const hasMore = mapped.length > limit;
    const page = mapped.slice(0, limit);
    const last = page[page.length - 1] as any;
    const nextCursor = hasMore && last
      ? encodeCursor(new Date(last._sortTime).toISOString(), last.hash, last._rowType, last._eventIndex)
      : null;

    res.status(200).json({
      indexed: true,
      syncStatus: sync.sync_status,
      rows: page.map(({ _sortTime, _rowType, _eventIndex, ...row }: any) => row),
      nextCursor,
      requestId,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'RATE_LIMIT_NOT_CONFIGURED') {
      sendError(res, 503, 'rate_limit_not_configured', requestId);
      return;
    }
    // Do not expose SQL, provider, address, or connection details to clients.
    sendError(res, 503, 'history_temporarily_unavailable', requestId);
  }
}
