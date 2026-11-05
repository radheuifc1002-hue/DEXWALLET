import { consumeRateLimit } from './_lib/rate-limit.js';

type Chain = 'bitcoin' | 'tron';
type Network = 'mainnet' | 'testnet';
const BTC_API: Record<Network, string> = {
  mainnet: 'https://mempool.space/api',
  // DEXWALLET Bitcoin testnet uses Testnet4.
  testnet: 'https://mempool.space/testnet4/api',
};
function bitcoinAddressHistoryUrl(network: Network, address: string, afterTxid?: string): string {
  const base = BTC_API[network] + '/address/' + encodeURIComponent(address) + '/txs';
  return afterTxid ? base + '/chain/' + encodeURIComponent(afterTxid) : base;
}
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

const TRON_ALCHEMY_NETWORK: Record<Network, string> = {
  mainnet: 'tron-mainnet',
  testnet: 'tron-testnet',
};
function alchemyTronBase(network: Network): string | null {
  const scoped = process.env['ALCHEMY_TRON_' + network.toUpperCase() + '_API_KEY'];
  const key = scoped || process.env.ALCHEMY_API_KEY;
  // Alchemy testnet and TronGrid Nile are different networks; do not enrich Nile
  // transaction IDs with Alchemy's Tron testnet (Shasta) endpoint.
  if (!key || network !== 'mainnet') return null;
  return 'https://' + TRON_ALCHEMY_NETWORK[network] + '.g.alchemy.com/v2/' + encodeURIComponent(key);
}
async function tronGridPost(network: Network, path: string, txid: string, headers: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(TRON_API[network] + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify({ value: txid }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.Error || data?.error) {
      throw new Error('trongrid_tx_http_' + response.status);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function alchemyTronPost(base: string, path: string, txid: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ value: txid }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.Error || data?.error) throw new Error('alchemy_tron_tx_http_' + response.status);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

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
      // Mempool.space/Esplora is the address-history indexer. It returns full
      // transaction bodies, so no Alchemy UTXO/indexing entitlement is needed.
      // Fetch the first page, then continue confirmed-history pagination until
      // we have at most 50 unique transactions.
      const seen = new Map<string, any>();
      const firstPage = await getJson(bitcoinAddressHistoryUrl(network, address));
      for (const tx of Array.isArray(firstPage) ? firstPage : []) {
        const txid = String(tx?.txid || '');
        if (txid) seen.set(txid, tx);
      }
      const firstConfirmed = [...seen.values()].filter((tx: any) => tx?.status?.confirmed);
      let cursor = String(firstConfirmed[firstConfirmed.length - 1]?.txid || '');
      for (let page = 0; page < 3 && seen.size < 50 && cursor; page++) {
        const batch = await getJson(bitcoinAddressHistoryUrl(network, address, cursor));
        if (!Array.isArray(batch) || batch.length === 0) break;
        const before = seen.size;
        for (const tx of batch) {
          const txid = String(tx?.txid || '');
          if (txid) seen.set(txid, tx);
        }
        const confirmedBatch = batch.filter((tx: any) => tx?.status?.confirmed);
        const nextCursor = String(confirmedBatch[confirmedBatch.length - 1]?.txid || '');
        if (seen.size === before || !nextCursor || nextCursor === cursor) break;
        cursor = nextCursor;
      }
      const txs = [...seen.values()].slice(0, 50);
      const rows = txs.map((tx: any) => {
        const inputs = Array.isArray(tx?.vin) ? tx.vin : [];
        const outputs = Array.isArray(tx?.vout) ? tx.vout : [];
        let sent = 0n;
        for (const input of inputs) {
          if (String(input?.prevout?.scriptpubkey_address || '') === address) {
            sent += BigInt(String(input?.prevout?.value || '0'));
          }
        }
        let received = 0n;
        for (const output of outputs) {
          if (String(output?.scriptpubkey_address || '') === address) {
            received += BigInt(String(output?.value || '0'));
          }
        }
        const delta = received - sent;
        const incoming = sent === 0n || delta >= 0n;
        const amount = incoming ? received : sent - received;
        const hash = String(tx?.txid || '');
        const other = incoming
          ? inputs.map((input: any) => String(input?.prevout?.scriptpubkey_address || '')).find((item: string) => item && item !== address)
          : outputs.map((output: any) => String(output?.scriptpubkey_address || '')).find((item: string) => item && item !== address);
        const confirmed = Boolean(tx?.status?.confirmed);
        const timestamp = confirmed ? Number(tx?.status?.block_time || 0) : 0;
        return {
          id: hash, hash,
          title: incoming ? 'Received BTC' : 'Sent BTC',
          subtitle: other ? (incoming ? 'From ' : 'To ') + short(other) : 'Bitcoin transaction',
          amount: (incoming ? '+' : '-') + btc(amount) + ' BTC',
          fee: btc(BigInt(String(tx?.fee || '0'))) + ' BTC',
          timestamp,
          status: confirmed ? 'Confirmed' : 'Pending',
          incoming,
          explorerUrl: BTC_EXPLORER[network] + hash,
        };
      }).filter((row: any) => row.hash);
      return res.status(200).json({
        chain, network, walletAddress: address, rows, limit: 50,
        complete: rows.length < 50,
        source: 'mempool-space-esplora-indexer',
      });
    }

    // Alchemy provides TRON node RPC, but not a documented address-history indexer.
    // Keep the address-activity query on TronGrid until Alchemy exposes that data API.
    const headers: Record<string, string> = process.env.TRONGRID_API_KEY
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

    // TronGrid supplies address -> txID discovery (Alchemy has no documented
    // address-history indexer). Enrich known mainnet txIDs using Alchemy's
    // canonical transaction and execution-info endpoints.
    const alchemyBase = alchemyTronBase(network);
    const discoveredTxids = [...new Set([
      ...(Array.isArray(nativePayload?.data) ? nativePayload.data : []).map((tx: any) => String(tx?.txID || tx?.txid || '')),
      ...(Array.isArray(tokenPayload?.data) ? tokenPayload.data : []).map((tx: any) => String(tx?.transaction_id || '')),
    ].filter((txid: string) => /^[a-fA-F0-9]{64}$/.test(txid)))].slice(0, 10);
    const transactionDetails = new Map<string, { transaction: any; info: any; source: 'alchemy' | 'trongrid' }>();
    let alchemyDetailFailures = 0;
    let tronGridDetailFallbacks = 0;
    for (let offset = 0; offset < discoveredTxids.length; offset += 5) {
      const batch = discoveredTxids.slice(offset, offset + 5);
      await Promise.all(batch.map(async (txid) => {
        // Alchemy is the preferred transaction/receipt provider. Fall back to
        // TronGrid's node endpoints for the same txID if Alchemy is unavailable,
        // rejects the method, times out, or returns an empty response.
        if (alchemyBase) {
          try {
            const [transaction, info] = await Promise.all([
              alchemyTronPost(alchemyBase, '/wallet/gettransactionbyid', txid),
              alchemyTronPost(alchemyBase, '/walletsolidity/gettransactioninfobyid', txid),
            ]);
            if (transaction?.txID || info?.id || info?.blockNumber || info?.receipt) {
              transactionDetails.set(txid, { transaction, info, source: 'alchemy' });
              return;
            }
            throw new Error('alchemy_tron_empty_transaction_detail');
          } catch (error) {
            alchemyDetailFailures++;
            console.warn('tron_alchemy_detail_failed_using_trongrid_fallback', txid,
              error instanceof Error ? error.message : 'unknown');
          }
        }
        try {
          tronGridDetailFallbacks++;
          const [transaction, info] = await Promise.all([
            tronGridPost(network, '/wallet/gettransactionbyid', txid, headers),
            tronGridPost(network, '/walletsolidity/gettransactioninfobyid', txid, headers),
          ]);
          if (transaction?.txID || info?.id || info?.blockNumber || info?.receipt) {
            transactionDetails.set(txid, { transaction, info, source: 'trongrid' });
          }
        } catch (error) {
          console.warn('tron_trongrid_detail_fallback_failed', txid,
            error instanceof Error ? error.message : 'unknown');
        }
      }));
    }

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
      const detail = transactionDetails.get(hash);
      const timestamp = Math.floor(Number(detail?.info?.blockTimeStamp || tx?.block_timestamp || tx?.raw_data?.timestamp || 0) / 1000);
      const confirmed = Boolean(detail?.info?.blockNumber || tx?.blockNumber || tx?.block_number || (Array.isArray(tx?.ret) && tx.ret.length));
      const success = String(detail?.info?.receipt?.result || detail?.transaction?.ret?.[0]?.contractRet || tx?.ret?.[0]?.contractRet || '') === 'SUCCESS';
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
        timestamp: Math.floor(Number(transactionDetails.get(hash)?.info?.blockTimeStamp || tx?.block_timestamp || 0) / 1000),
        status: transactionDetails.get(hash)?.info?.receipt?.result === 'SUCCESS' || tx?.confirmed ? 'Confirmed' : 'Pending', incoming,
        explorerUrl: TRON_EXPLORER[network] + hash,
      };
    }).filter((row: any) => row.hash);

    const rows = [...nativeRows, ...tokenRows]
      .sort((a: any, b: any) => b.timestamp - a.timestamp).slice(0, 50);
    return res.status(200).json({
      chain, network, walletAddress: address, rows, limit: 50,
      complete: !nativePayload?.meta?.fingerprint && !tokenPayload?.meta?.fingerprint,
      source: 'trongrid-index+alchemy-primary-trongrid-fallback',
      providers: { preferred: alchemyBase ? 'alchemy' : 'trongrid', alchemyDetailFailures, tronGridDetailFallbacks },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('chain_history_failed', chain, network, message);

    return res.status(502).json({ error: { code: 'history_provider_unavailable' } });
  }
}
