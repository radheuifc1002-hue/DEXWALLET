import { randomUUID } from 'node:crypto';
import { proxyRpc } from './_lib/rpc-manager.js';

type RpcResult<T> = { result?: T; error?: { message?: string } };
type SignatureInfo = { signature: string; slot: number; blockTime?: number | null; err?: unknown };
type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount?: { amount?: string; decimals?: number } };
type AccountKey = string | { pubkey?: string };
type Transaction = {
  slot?: number;
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  };
  transaction?: { message?: { accountKeys?: AccountKey[] } };
};
type ApiRequest = { method?: string; body?: unknown };
type ApiResponse = { setHeader(name:string,value:string):void; status(code:number):ApiResponse; json(value:unknown):void; end():void };

const MAX_ROWS = 50;
const MAX_SIGNATURES = 50;
const TX_CONCURRENCY = 5;
const SOL_LAMPORTS = 1_000_000_000;
const EXPLORERS = {
  mainnet: 'https://solscan.io/tx/',
  testnet: 'https://solscan.io/tx/',
};

function parseBody(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') { if (value.length > 8192) return null; try { value = JSON.parse(value); } catch { return null; } }
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 8192) return null;
  return value as Record<string, unknown>;
}
function formatUnits(raw: bigint, decimals: number): string {
  const d = Math.max(0, Math.min(18, decimals));
  const unit = 10n ** BigInt(d);
  const whole = raw / unit;
  const fraction = (raw < 0n ? -raw : raw) % unit;
  const tail = fraction.toString().padStart(d, '0').slice(0, 8).replace(/0+$/, '');
  return (raw < 0n && whole === 0n ? '-' : '') + whole.toString() + (tail ? '.' + tail : '');
}
function accountKey(value: AccountKey): string {
  return typeof value === 'string' ? value : String(value?.pubkey || '');
}
async function rpc<T>(network: 'mainnet' | 'testnet', method: string, params: unknown[]): Promise<T> {
  const response = await proxyRpc('solana', network, {
    jsonrpc: '2.0', id: randomUUID(), method, params,
  });
  if (response.status < 200 || response.status >= 300) throw new Error('solana_rpc_unavailable');
  const payload = JSON.parse(response.body) as RpcResult<T>;
  if (payload.error || payload.result === undefined) throw new Error('solana_rpc_unavailable');
  return payload.result;
}
async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try { output[index] = await mapper(items[index]); } catch { output[index] = null as R; }
    }
  }));
  return output;
}
function amountDelta(pre?: string, post?: string): bigint {
  try { return BigInt(post || '0') - BigInt(pre || '0'); } catch { return 0n; }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const requestId = randomUUID();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: { code: 'method_not_allowed', requestId } }); return; }

  const body = parseBody(req.body);
  if (!body) { res.status(400).json({ error: { code: 'invalid_request_body', requestId } }); return; }
  const wallet = String(body.walletAddress || '');
  const network = String(body.network || 'mainnet').toLowerCase();
  const isNative = body.isNative !== false;
  const mint = String(body.mintAddress || '');
  const before = String(body.before || '');
  const limitValue = Number(body.limit ?? MAX_ROWS);
  const limit = Number.isInteger(limitValue) ? Math.max(1, Math.min(MAX_ROWS, limitValue)) : MAX_ROWS;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) { res.status(400).json({ error: { code: 'invalid_wallet_address', requestId } }); return; }
  if (network !== 'mainnet' && network !== 'testnet') { res.status(400).json({ error: { code: 'unsupported_network', requestId } }); return; }
  if (!isNative && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) { res.status(400).json({ error: { code: 'invalid_token_mint', requestId } }); return; }
  if (before && !/^[1-9A-HJ-NP-Za-km-z]{32,100}$/.test(before)) { res.status(400).json({ error: { code: 'invalid_cursor', requestId } }); return; }

  try {
    const signatures = await rpc<SignatureInfo[]>(network, 'getSignaturesForAddress', [
      wallet, { limit: MAX_SIGNATURES, commitment: 'confirmed', ...(before ? { before } : {}) },
    ]);
    const transactions = await mapLimit(signatures, TX_CONCURRENCY, item =>
      rpc<Transaction | null>(network, 'getTransaction', [item.signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }])
    );
    const rows = transactions.flatMap((tx, index) => {
      const signature = signatures[index];
      if (!tx || !signature) return [];
      const meta = tx.meta;
      const failed = Boolean(meta?.err ?? signature.err);
      const keys = (tx.transaction?.message?.accountKeys || []).map(accountKey);
      const walletIndex = keys.indexOf(wallet);
      const explorerUrl = EXPLORERS[network] + signature.signature + (network === 'testnet' ? '?cluster=devnet' : '');
      const timestamp = Number(tx.blockTime ?? signature.blockTime ?? 0);
      if (isNative) {
        if (walletIndex < 0) return [];
        const delta = amountDelta(String(meta?.preBalances?.[walletIndex] ?? '0'), String(meta?.postBalances?.[walletIndex] ?? '0'));
        if (delta === 0n) return [];
        const counterparty = keys.find(key => key && key !== wallet) || '';
        return [{
          id: signature.signature + ':sol', hash: signature.signature,
          title: delta > 0n ? 'Received SOL' : 'Sent SOL',
          detail: (delta > 0n ? 'From ' : 'To ') + (counterparty ? counterparty.slice(0, 8) + '…' + counterparty.slice(-6) : 'Network'),
          amount: (delta > 0n ? '+' : '-') + formatUnits(delta > 0n ? delta : -delta, 9) + ' SOL',
          timestamp, incoming: delta > 0n, failed, explorerUrl, assetType: 'native', mintAddress: null,
        }];
      }
      const pre = (meta?.preTokenBalances || []).filter(item => item.mint === mint && item.owner === wallet);
      const post = (meta?.postTokenBalances || []).filter(item => item.mint === mint && item.owner === wallet);
      const decimals = post[0]?.uiTokenAmount?.decimals ?? pre[0]?.uiTokenAmount?.decimals ?? 0;
      const preAmount = pre.reduce((sum, item) => sum + BigInt(item.uiTokenAmount?.amount || '0'), 0n);
      const postAmount = post.reduce((sum, item) => sum + BigInt(item.uiTokenAmount?.amount || '0'), 0n);
      const delta = postAmount - preAmount;
      if (delta === 0n) return [];
      const counterparty = keys.find(key => key && key !== wallet) || '';
      return [{
        id: signature.signature + ':' + mint, hash: signature.signature,
        title: delta > 0n ? 'Received token' : 'Sent token',
        detail: (delta > 0n ? 'From ' : 'To ') + (counterparty ? counterparty.slice(0, 8) + '…' + counterparty.slice(-6) : 'Network'),
        amount: (delta > 0n ? '+' : '-') + formatUnits(delta > 0n ? delta : -delta, decimals),
        timestamp, incoming: delta > 0n, failed, explorerUrl, assetType: 'token', mintAddress: mint,
      }];
    }).filter(Boolean).sort((a, b) => b.timestamp - a.timestamp);
    const lastSignature = signatures.length ? signatures[signatures.length - 1].signature : null;
    res.status(200).json({
      chain: 'solana', network, walletAddress: wallet,
      asset: { type: isNative ? 'native' : 'token', mintAddress: isNative ? null : mint },
      rows: rows.slice(0, limit), limit, requestId, source: 'solana-rpc',
      nextBefore: signatures.length === MAX_SIGNATURES ? lastSignature : null,
      hasMore: signatures.length === MAX_SIGNATURES,
      complete: signatures.length < MAX_SIGNATURES,
    });
  } catch {
    res.status(502).json({ error: { code: 'history_provider_unavailable', requestId } });
  }
}
