import { randomUUID } from 'node:crypto';

const ALCHEMY_NETWORKS: Record<string, string> = {
  'ethereum:mainnet': 'eth-mainnet',
  'ethereum:testnet': 'eth-sepolia',
  'bnb:mainnet': 'bnb-mainnet',
  'bnb:testnet': 'bnb-testnet',
  'polygon:mainnet': 'polygon-mainnet',
  'polygon:testnet': 'polygon-amoy',
  'solana:mainnet': 'solana-mainnet',
  'solana:testnet': 'solana-devnet',
};

const MAX_BODY_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 20_000;

export default async function handler(req: any, res: any) {
  const requestId = randomUUID();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: { code: 'method_not_allowed', requestId } });
  }

  const chain = String(req.query?.chain || '').toLowerCase();
  const network = String(req.query?.network || '').toLowerCase();
  const alchemyNetwork = ALCHEMY_NETWORKS[chain + ':' + network];
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!alchemyNetwork || !apiKey) {
    return res.status(!alchemyNetwork ? 400 : 503).json({
      error: { code: !alchemyNetwork ? 'unsupported_network' : 'rpc_not_configured', requestId },
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      return res.status(413).json({ error: { code: 'payload_too_large', requestId } });
    }
    try { body = JSON.parse(body); } catch {
      return res.status(400).json({ error: { code: 'invalid_json', requestId } });
    }
  }
  if (!body || (typeof body !== 'object') || Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(400).json({ error: { code: 'invalid_rpc_payload', requestId } });
  }
  const requests = Array.isArray(body) ? body : [body];
  if (!requests.length || requests.length > 100 || requests.some((item) =>
    !item || typeof item !== 'object' || item.jsonrpc !== '2.0' ||
    typeof item.method !== 'string' || item.method.length > 128
  )) {
    return res.status(400).json({ error: { code: 'invalid_json_rpc_request', requestId } });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch('https://' + alchemyNetwork + '.g.alchemy.com/v2/' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await upstream.text();
    res.setHeader('X-RPC-Provider', 'alchemy');
    res.setHeader('X-RPC-Network', alchemyNetwork);
    return res.status(upstream.status).send(payload);
  } catch (error: any) {
    const timedOut = error?.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({
      error: { code: timedOut ? 'upstream_timeout' : 'upstream_unavailable', requestId },
    });
  } finally {
    clearTimeout(timeout);
  }
}
