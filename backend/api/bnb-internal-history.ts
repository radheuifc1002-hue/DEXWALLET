import { randomUUID } from 'node:crypto';

type Request = { method?: string; body?: unknown };
type Response = {
  setHeader(name: string, value: string): void;
  status(code: number): Response;
  json(value: unknown): void;
  end(): void;
};

const RPC_TIMEOUT_MS = 25_000;
const MAX_BODY_BYTES = 4096;
const MAX_ROWS = 50;

function error(res: Response, status: number, code: string, requestId: string) {
  res.status(status).json({ error: { code, requestId } });
}

export default async function handler(req: Request, res: Response) {
  const requestId = randomUUID();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    error(res, 405, 'method_not_allowed', requestId);
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) { error(res, 413, 'payload_too_large', requestId); return; }
    try { body = JSON.parse(body); } catch { error(res, 400, 'invalid_json', requestId); return; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    error(res, 400, 'invalid_request', requestId);
    return;
  }

  const wallet = String((body as any).walletAddress || '');
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) { error(res, 400, 'invalid_wallet_address', requestId); return; }

  const endpoint = process.env.CHAINSTACK_BNB_MAINNET_RPC_URL;
  if (!endpoint) { error(res, 503, 'bnb_trace_provider_not_configured', requestId); return; }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const rpc = async (method: string, params: unknown[]) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('trace provider HTTP error');
      const data = await response.json() as any;
      if (data?.error) throw new Error('trace provider RPC error');
      return data?.result;
    };

    // Keep each address-direction query bounded. trace_filter over genesis-to-tip
    // can exceed provider range/response limits and stall a wallet screen.
    const latestBlock = BigInt(String(await rpc('eth_blockNumber', [])));
    const fromBlock = latestBlock > 20000n ? latestBlock - 20000n : 0n;
    const range = {
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: '0x' + latestBlock.toString(16),
      count: '0x64',
    };
    const [outgoing, incoming] = await Promise.all([
      rpc('trace_filter', [{ ...range, fromAddress: [wallet] }]),
      rpc('trace_filter', [{ ...range, toAddress: [wallet] }]),
    ]);
    if (!Array.isArray(outgoing) || !Array.isArray(incoming)) {
      error(res, 502, 'bnb_trace_invalid_response', requestId);
      return;
    }
    const traceResults = [...outgoing, ...incoming];
    const traces = traceResults.filter((trace: any) =>
      trace?.type === 'call' &&
      Array.isArray(trace.traceAddress) &&
      trace.traceAddress.length > 0 &&
      String(trace.action?.callType || 'call') === 'call' &&
      BigInt(String(trace.action?.value || '0x0')) > 0n &&
      !trace.error &&
      /^0x[a-fA-F0-9]{64}$/.test(String(trace.transactionHash || ''))
    );

    const latest = traces.sort((a: any, b: any) =>
      Number(BigInt(String(b.blockNumber || '0x0')) - BigInt(String(a.blockNumber || '0x0'))) ||
      String(b.transactionHash).localeCompare(String(a.transactionHash)) ||
      JSON.stringify(b.traceAddress).localeCompare(JSON.stringify(a.traceAddress))
    ).slice(0, MAX_ROWS);

    const blockNumbers = [...new Set(latest.map((trace: any) => String(trace.blockNumber)))];
    const timestampEntries = await Promise.all(blockNumbers.map(async (blockNumber) => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: [blockNumber, false] }),
          signal: controller.signal,
        });
        const data = await response.json() as any;
        return [blockNumber, Number(BigInt(String(data?.result?.timestamp || '0x0')))] as const;
      } catch { return [blockNumber, 0] as const; }
    }));
    const timestamps = new Map(timestampEntries);

    const rows = latest.map((trace: any, index: number) => {
      const from = String(trace.action.from || '');
      const to = String(trace.action.to || '');
      const incoming = to.toLowerCase() === wallet.toLowerCase();
      const hash = String(trace.transactionHash);
      const value = BigInt(String(trace.action.value));
      const whole = value / 10n ** 18n;
      const fraction = (value % (10n ** 18n)).toString().padStart(18, '0').slice(0, 8).replace(/0+$/, '');
      const bnb = whole.toString() + (fraction ? '.' + fraction : '');
      return {
        id: hash + ':internal:' + trace.traceAddress.join('-'),
        hash,
        title: (incoming ? 'Received ' : 'Sent ') + 'BNB',
        detail: 'Internal transfer · ' + (incoming ? 'From ' : 'To ') + (incoming ? from : to),
        amount: (incoming ? '+' : '-') + bnb.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + ' BNB',
        timestamp: timestamps.get(String(trace.blockNumber)) || 0,
        incoming,
        failed: false,
        explorerUrl: 'https://bscscan.com/tx/' + hash,
      };
    });

    res.status(200).json({ rows, requestId });
  } catch (cause: any) {
    error(res, cause?.name === 'AbortError' ? 504 : 502, 'bnb_trace_provider_unavailable', requestId);
  } finally {
    clearTimeout(timeout);
  }
}
