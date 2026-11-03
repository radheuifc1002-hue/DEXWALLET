import { consumeRateLimit } from './_lib/rate-limit.js';

type Chain = 'bitcoin' | 'tron';
type Network = 'mainnet' | 'testnet';
const BTC_API: Record<Network, string> = {
  mainnet: 'https://mempool.space/api',
  testnet: 'https://mempool.space/testnet4/api',
};
const BTC_EXPLORER: Record<Network, string> = {
  mainnet: 'https://mempool.space/tx/',
  testnet: 'https://mempool.space/testnet4/tx/',
};
const TRON_API: Record<Network, string> = {
  mainnet: 'https://api.trongrid.io',
  testnet: 'https://nile.trongrid.io',
};
const TRON_EXPLORER: Record<Network, string> = {
  mainnet: 'https://tronscan.org/#/transaction/',
  testnet: 'https://nile.tronscan.org/#/transaction/',
};

function validAddress(chain: Chain, value: string, network: Network): boolean {
  if (chain === 'tron') return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
  if (network === 'mainnet') {
    return /^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value)
      || /^bc1[ac-hj-np-z02-9]{20,90}$/i.test(value);
  }
  return /^[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value)
    || /^tb1[ac-hj-np-z02-9]{20,90}$/i.test(value);
}
async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error('upstream_http_' + response.status);
    return data;
  } finally {
    clearTimeout(timer);
  }
}
const short = (value: string) => value.length > 18 ? value.slice(0, 9) + '…' + value.slice(-7) : value;
function btc(satoshis: bigint): string {
  const whole = satoshis / 100000000n;
  const fraction = (satoshis % 100000000n).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction ? whole + '.' + fraction : String(whole);
}
function tokenUnits(raw: unknown, decimals: number): string {
  const value = BigInt(String(raw || '0'));
  const places = Math.max(0, Math.min(30, decimals));
  const unit = 10n ** BigInt(places);
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(places, '0').replace(/0+$/, '');
  return fraction ? whole + '.' + fraction : String(whole);
}
function tronAddressHex(address: string): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;
  for (const char of address) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('invalid_tron_address');
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) { bytes.unshift(Number(value & 255n)); value >>= 8n; }
  for (let i = 0; i < address.length && address[i] === '1'; i++) bytes.unshift(0);
  if (bytes.length !== 25) throw new Error('invalid_tron_address');
  return bytes.slice(0, 21).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: { code: 'method_not_allowed' } });
  }
  const rate = consumeRateLimit(req, 'chain-history', 30);
  if (!rate.allowed) return res.status(429).json({ error: { code: 'rate_limit_exceeded' } });

  const chain = String(req.body?.chain || '').toLowerCase() as Chain;
  const network = String(req.body?.network || '').toLowerCase() as Network;
  const address = String(req.body?.walletAddress || '');
  if (!['bitcoin', 'tron'].includes(chain) || !['mainnet', 'testnet'].includes(network)
      || !validAddress(chain, address, network)) {
    return res.status(400).json({ error: { code: 'invalid_request' } });
  }

  try {
    if (chain === 'bitcoin') {
      const txs = await getJson(BTC_API[network] + '/address/' + encodeURIComponent(address) + '/txs') as any[];
      const rows = (Array.isArray(txs) ? txs : []).slice(0, 50).map((tx: any) => {
        const inputs = Array.isArray(tx?.vin) ? tx.vin : [];
        const outputs = Array.isArray(tx?.vout) ? tx.vout : [];
        const sent = inputs
          .filter((input: any) => input?.prevout?.scriptpubkey_address === address)
          .reduce((sum: bigint, input: any) => sum + BigInt(input?.prevout?.value || 0), 0n);
        const received = outputs
          .filter((output: any) => output?.scriptpubkey_address === address)
          .reduce((sum: bigint, output: any) => sum + BigInt(output?.value || 0), 0n);
        const delta = received - sent;
        const incoming = delta >= 0n;
        const hash = String(tx?.txid || '');
        const other = incoming
          ? inputs.find((input: any) => input?.prevout?.scriptpubkey_address && input.prevout.scriptpubkey_address !== address)?.prevout?.scriptpubkey_address
          : outputs.find((output: any) => output?.scriptpubkey_address && output.scriptpubkey_address !== address)?.scriptpubkey_address;
        const confirmed = Boolean(tx?.status?.confirmed);
        return {
          id: hash, hash, title: incoming ? 'Received BTC' : 'Sent BTC',
          subtitle: other ? (incoming ? 'From ' : 'To ') + short(String(other)) : 'Bitcoin transaction',
          amount: (incoming ? '+' : '-') + btc(delta < 0n ? -delta : delta) + ' BTC',
          timestamp: confirmed ? Number(tx.status.block_time || 0) : 0,
          status: confirmed ? 'Confirmed' : 'Pending', incoming,
          explorerUrl: BTC_EXPLORER[network] + hash,
        };
      }).filter((row: any) => row.hash);
      return res.status(200).json({
        chain, network, walletAddress: address, rows, limit: 50,
        complete: rows.length < 50, source: 'mempool-space',
      });
    }

    const headers = process.env.TRONGRID_API_KEY
      ? { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }
      : {};
    const addressHex = tronAddressHex(address);
    const accountUrl = TRON_API[network] + '/v1/accounts/' + encodeURIComponent(address)
      + '/transactions?limit=50&order_by=block_timestamp,desc&only_confirmed=false';
    const tokenUrl = TRON_API[network] + '/v1/accounts/' + encodeURIComponent(address)
      + '/transactions/trc20?limit=50&order_by=block_timestamp,desc';
    const [nativePayload, tokenPayload] = await Promise.all([
      getJson(accountUrl, headers), getJson(tokenUrl, headers),
    ]);

    const nativeRows = (Array.isArray(nativePayload?.data) ? nativePayload.data : []).map((tx: any) => {
      const contract = tx?.raw_data?.contract?.[0];
      if (String(contract?.type || '') !== 'TransferContract') return null;
      const value = contract?.parameter?.value || {};
      const ownerHex = String(value?.owner_address || '').toLowerCase().replace(/^0x/, '');
      const recipientHex = String(value?.to_address || '').toLowerCase().replace(/^0x/, '');
      const incoming = recipientHex === addressHex && ownerHex !== addressHex;
      if (ownerHex !== addressHex && recipientHex !== addressHex) return null;
      const amount = BigInt(String(value?.amount || 0));
      const hash = String(tx?.txID || tx?.txid || '');
      const timestamp = Math.floor(Number(tx?.block_timestamp || tx?.raw_data?.timestamp || 0) / 1000);
      const confirmed = Boolean(tx?.blockNumber || tx?.block_number || (Array.isArray(tx?.ret) && tx.ret.length));
      const success = tx?.ret?.[0]?.contractRet === 'SUCCESS';
      return {
        id: hash + ':native', hash,
        title: incoming ? 'Received TRX' : 'Sent TRX',
        subtitle: incoming ? 'Incoming transfer' : 'Outgoing transfer',
        amount: (incoming ? '+' : '-') + (Number(amount) / 1000000).toString() + ' TRX',
        timestamp, status: confirmed ? (success ? 'Confirmed' : 'Failed') : 'Pending',
        incoming, explorerUrl: TRON_EXPLORER[network] + hash,
      };
    }).filter(Boolean);

    const tokenRows = (Array.isArray(tokenPayload?.data) ? tokenPayload.data : []).map((tx: any) => {
      const from = String(tx?.from || '');
      const to = String(tx?.to || '');
      const incoming = to.toLowerCase() === address.toLowerCase();
      const hash = String(tx?.transaction_id || '');
      const info = tx?.token_info || {};
      const symbol = String(info?.symbol || 'TRC20');
      const decimals = Number(info?.decimals ?? 6);
      return {
        id: hash + ':trc20:' + String(tx?.contract_address || ''), hash,
        title: (incoming ? 'Received ' : 'Sent ') + symbol,
        subtitle: (incoming ? 'From ' : 'To ') + short(incoming ? from : to),
        amount: (incoming ? '+' : '-') + tokenUnits(tx?.value, decimals) + ' ' + symbol,
        timestamp: Math.floor(Number(tx?.block_timestamp || 0) / 1000),
        status: tx?.confirmed ? 'Confirmed' : 'Pending', incoming,
        explorerUrl: TRON_EXPLORER[network] + hash,
      };
    }).filter((row: any) => row.hash);

    const rows = [...nativeRows, ...tokenRows]
      .sort((a: any, b: any) => b.timestamp - a.timestamp).slice(0, 50);
    return res.status(200).json({
      chain, network, walletAddress: address, rows, limit: 50,
      complete: !nativePayload?.meta?.fingerprint && !tokenPayload?.meta?.fingerprint,
      source: 'trongrid-v1',
    });
  } catch (error) {
    console.error('chain_history_failed', chain, network, error instanceof Error ? error.message : 'unknown');
    return res.status(502).json({ error: { code: 'history_provider_unavailable' } });
  }
}
