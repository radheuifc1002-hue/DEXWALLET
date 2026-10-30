import { ethers } from 'ethers';
import { Blockchain, Network, Token } from '../../context/WalletContext';
import { getSolanaRpcEndpoint } from './rpcManager';

export type WalletActivity = {
  id: string;
  hash: string;
  timestamp: number | null;
  title: string;
  subtitle: string;
  amount?: string;
  direction?: 'in' | 'out' | 'self' | 'contract';
  status: 'success' | 'failed' | 'pending';
  explorerUrl: string;
};

const CHAIN_ID: Record<'ethereum', { mainnet: number; testnet: number }> = {
  ethereum: { mainnet: 1, testnet: 11155111 },
};
const EXPLORER: Record<Blockchain, { mainnet: string; testnet: string }> = {
  ethereum: { mainnet: 'https://etherscan.io', testnet: 'https://sepolia.etherscan.io' },
  bnb: { mainnet: 'https://bscscan.com', testnet: 'https://testnet.bscscan.com' },
  polygon: { mainnet: 'https://polygonscan.com', testnet: 'https://amoy.polygonscan.com' },
  solana: { mainnet: 'https://explorer.solana.com', testnet: 'https://explorer.solana.com' },
};

export function getAssetExplorerUrl(chain: Blockchain, network: Network, address: string, contractAddress?: string) {
  const base = EXPLORER[chain][network];
  if (chain === 'solana') return `${base}/address/${address}${network === 'testnet' ? '?cluster=devnet' : ''}`;
  return contractAddress ? `${base}/token/${contractAddress}?a=${address}` : `${base}/address/${address}`;
}

function safeBigInt(value: unknown): bigint {
  try { return BigInt(String(value ?? '0')); } catch { return 0n; }
}
function formatAmount(value: unknown, decimals: number, symbol: string) {
  if (value === undefined || value === null) return undefined;
  const formatted = Number(ethers.formatUnits(safeBigInt(value), decimals));
  return Number.isFinite(formatted) ? `${formatted.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol}` : undefined;
}
function short(value: string) { return value ? `${value.slice(0, 8)}…${value.slice(-4)}` : 'Unknown'; }
function mergeRows(rows: any[]) {
  const unique = new Map<string, any>();
  rows.forEach((tx) => {
    const hash = String(tx.hash || tx.transactionHash || tx.transaction_hash || '');
    const index = tx.logIndex ?? tx.log_index ?? tx.traceId ?? tx.trace_id ?? 'tx';
    if (hash) unique.set(`${hash}:${index}`, tx);
  });
  return [...unique.values()];
}
function sortAndLimit(rows: WalletActivity[]) {
  return rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 50);
}
function explorerTx(chain: Blockchain, network: Network, hash: string) {
  return `${EXPLORER[chain][network]}/tx/${hash}`;
}

async function fetchJson(url: string) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`History provider returned HTTP ${response.status}.`);
  return response.json();
}
async function fetchRoutescan(chain: 'ethereum', network: Network, params: Record<string, string>) {
  const chainId = CHAIN_ID[chain][network];
  const url = new URL(`https://api.routescan.io/v2/network/${network}/evm/${chainId}/etherscan/api`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const body = await fetchJson(url.toString());
  if (body.status === '0' && body.message !== 'No transactions found' && !String(body.result || '').toLowerCase().includes('no transactions')) {
    throw new Error(body.result || body.message || 'Unable to retrieve indexed transactions.');
  }
  return Array.isArray(body.result) ? body.result : [];
}

function formatEtherscanRows(rows: any[], chain: Exclude<Blockchain, 'solana'>, network: Network, wallet: string, asset: Token) {
  const contract = asset.contractAddress?.toLowerCase();
  return rows.map((tx) => {
    const from = String(tx.from || '').toLowerCase();
    const to = String(tx.to || '').toLowerCase();
    const mine = wallet.toLowerCase();
    const direction = from === mine && to === mine ? 'self' : from === mine ? 'out' : to === mine ? 'in' : 'contract';
    const hash = String(tx.hash || tx.transactionHash || '');
    const tokenTransfer = tx.tokenDecimal !== undefined || tx.tokenSymbol !== undefined;
    const amount = tokenTransfer
      ? formatAmount(tx.value, Number(tx.tokenDecimal || asset.decimals || 18), tx.tokenSymbol || asset.symbol)
      : (!contract ? formatAmount(tx.value, 18, asset.symbol) : undefined);
    const failed = tx.isError === '1' || tx.txreceipt_status === '0';
    const counterparty = direction === 'in' ? from : to;
    const timestamp = Number(tx.timeStamp || 0) || null;
    return {
      id: hash + String(tx.logIndex ?? tx.traceId ?? 'call'),
      hash, timestamp,
      title: tokenTransfer ? `${tx.tokenSymbol || asset.symbol} transfer` : contract ? 'Token contract interaction' : direction === 'contract' ? 'Contract interaction' : direction === 'in' ? 'Received' : direction === 'out' ? 'Sent' : 'Self transfer',
      subtitle: `${short(from)} → ${short(to)}`,
      amount, direction, status: failed ? 'failed' : 'success',
      explorerUrl: explorerTx(chain, network, hash),
    } as WalletActivity;
  }).filter((item) => Boolean(item.hash));
}

async function fetchRoutescanHistory(chain: 'ethereum', network: Network, wallet: string, asset: Token): Promise<WalletActivity[]> {
  const base = { module: 'account', address: wallet, page: '1', offset: '100', sort: 'desc' };
  if (asset.contractAddress) {
    const contract = asset.contractAddress.toLowerCase();
    const [normal, transfers] = await Promise.all([
      fetchRoutescan(chain, network, { ...base, action: 'txlist' }),
      fetchRoutescan(chain, network, { ...base, action: 'tokentx', contractaddress: contract }),
    ]);
    const interactions = normal.filter((tx: any) => String(tx.to || '').toLowerCase() === contract);
    return sortAndLimit(formatEtherscanRows(mergeRows([...interactions, ...transfers]), chain, network, wallet, asset));
  }
  const [normal, internal] = await Promise.all([
    fetchRoutescan(chain, network, { ...base, action: 'txlist' }),
    fetchRoutescan(chain, network, { ...base, action: 'txlistinternal' }).catch(() => []),
  ]);
  return sortAndLimit(formatEtherscanRows(mergeRows([...normal, ...internal]), chain, network, wallet, asset));
}

async function fetchPolygonBlockscout(network: Network, wallet: string, asset: Token): Promise<WalletActivity[]> {
  const host = network === 'mainnet' ? 'https://polygon.blockscout.com/api/v2' : 'https://polygon-amoy.blockscout.com/api/v2';
  const base = `${host}/addresses/${encodeURIComponent(wallet)}`;
  const [normalBody, secondaryBody] = await Promise.all([
    fetchJson(`${base}/transactions`),
    asset.contractAddress
      ? fetchJson(`${base}/token-transfers?token=${encodeURIComponent(asset.contractAddress)}`)
      : fetchJson(`${base}/internal-transactions`).catch(() => ({ items: [] })),
  ]);
  const normal = Array.isArray(normalBody.items) ? normalBody.items : [];
  const secondary = Array.isArray(secondaryBody.items) ? secondaryBody.items : [];
  const contract = asset.contractAddress?.toLowerCase();
  const interactions = contract ? normal.filter((tx: any) =>
    String(tx.to?.hash || tx.to || '').toLowerCase() === contract
  ) : [];
  const selected = contract ? [...interactions, ...secondary] : [...normal, ...secondary];
  const mine = wallet.toLowerCase();
  const rows = mergeRows(selected).map((tx: any) => {
    const from = String(tx.from?.hash || tx.from || '').toLowerCase();
    const to = String(tx.to?.hash || tx.to || '').toLowerCase();
    const direction = from === mine && to === mine ? 'self' : from === mine ? 'out' : to === mine ? 'in' : 'contract';
    const hash = String(tx.hash || tx.transaction_hash || tx.transactionHash || '');
    const token = tx.token || {};
    const isTokenTransfer = Boolean(tx.token || tx.token_type || tx.total?.value !== undefined);
    const rawValue = tx.total?.value ?? tx.value ?? tx.amount ?? '0';
    const decimals = Number(token.decimals ?? tx.token_decimals ?? (isTokenTransfer ? asset.decimals ?? 18 : 18));
    const amount = isTokenTransfer
      ? formatAmount(rawValue, decimals, token.symbol || asset.symbol)
      : (!contract ? formatAmount(rawValue, 18, asset.symbol) : undefined);
    const timestampRaw = tx.timestamp || tx.block_timestamp;
    const timestamp = typeof timestampRaw === 'string' && timestampRaw.includes('T')
      ? Math.floor(new Date(timestampRaw).getTime() / 1000)
      : Number(timestampRaw || 0) || null;
    const failed = ['error', 'failed'].includes(String(tx.status || tx.result || '').toLowerCase());
    return {
      id: hash + String(tx.log_index ?? tx.index ?? tx.trace_id ?? 'tx'),
      hash, timestamp,
      title: isTokenTransfer ? `${token.symbol || asset.symbol} transfer` : contract ? 'Token contract interaction' : direction === 'contract' ? (tx.method || 'Contract interaction') : direction === 'in' ? 'Received' : direction === 'out' ? 'Sent' : 'Internal transfer',
      subtitle: `${short(from)} → ${short(to)}`,
      amount, direction, status: failed ? 'failed' : 'success',
      explorerUrl: explorerTx('polygon', network, hash),
    } as WalletActivity;
  }).filter((item) => Boolean(item.hash));
  return sortAndLimit(rows);
}

async function fetchBnbBinplorer(wallet: string, asset: Token): Promise<WalletActivity[]> {
  const base = 'https://api.binplorer.com';
  const query = 'apiKey=freekey&limit=100&showZeroValues=true';
  const [normalData, tokenData] = await Promise.all([
    fetchJson(`${base}/getAddressTransactions/${encodeURIComponent(wallet)}?${query}`),
    asset.contractAddress
      ? fetchJson(`${base}/getAddressHistory/${encodeURIComponent(wallet)}?${query}`).catch(() => ({ operations: [] }))
      : Promise.resolve({ operations: [] }),
  ]);
  const normal = Array.isArray(normalData) ? normalData : [];
  const operations = Array.isArray(tokenData) ? tokenData : Array.isArray(tokenData.operations) ? tokenData.operations : [];
  const contract = asset.contractAddress?.toLowerCase();
  const interactions = contract ? normal.filter((tx: any) =>
    String(tx.to || '').toLowerCase() === contract || String(tx.from || '').toLowerCase() === contract
  ) : [];
  const transfers = contract ? operations.filter((tx: any) =>
    String(tx.tokenInfo?.address || '').toLowerCase() === contract
  ) : [];
  const merged = mergeRows(contract ? [...interactions, ...transfers] : normal);
  const rows = merged.map((tx: any) => {
    const from = String(tx.from || '').toLowerCase();
    const to = String(tx.to || tx.address || '').toLowerCase();
    const direction = from === wallet.toLowerCase() ? 'out' : to === wallet.toLowerCase() ? 'in' : 'contract';
    const hash = String(tx.transactionHash || tx.hash || tx.txHash || '');
    const token = tx.tokenInfo || tx.token || {};
    const isTokenTransfer = Boolean(token.address);
    const tokenValue = isTokenTransfer ? formatAmount(tx.value, Number(token.decimals ?? asset.decimals ?? 18), token.symbol || asset.symbol) : undefined;
    const nativeValue = tx.rawValue !== undefined
      ? Number(ethers.formatUnits(safeBigInt(tx.rawValue), 18))
      : Number(tx.value || 0);
    return {
      id: hash + String(tx.logIndex || (isTokenTransfer ? 'token' : 'call')),
      hash,
      timestamp: Number(tx.timestamp || 0) || null,
      title: isTokenTransfer ? `${token.symbol || asset.symbol} transfer` : contract ? 'Token contract interaction' : tx.input && tx.input !== '0x' ? 'Contract interaction' : direction === 'out' ? 'Sent' : direction === 'in' ? 'Received' : 'Contract interaction',
      subtitle: `${short(from)} → ${short(to)}`,
      amount: tokenValue || (nativeValue ? `${nativeValue.toLocaleString(undefined, { maximumFractionDigits: 6 })} BNB` : undefined),
      direction,
      status: tx.success === false ? 'failed' : 'success',
      explorerUrl: explorerTx('bnb', 'mainnet', hash),
    } as WalletActivity;
  }).filter((item: WalletActivity) => Boolean(item.hash));
  return sortAndLimit(rows);
}

async function fetchEvmHistory(chain: Exclude<Blockchain, 'solana'>, network: Network, wallet: string, asset: Token): Promise<WalletActivity[]> {
  if (chain === 'ethereum') return fetchRoutescanHistory(chain, network, wallet, asset);
  if (chain === 'polygon') return fetchPolygonBlockscout(network, wallet, asset);
  if (network === 'testnet') {
    throw new Error('BNB testnet transaction indexing is not available yet. You can open BscScan Testnet to inspect activity.');
  }
  return fetchBnbBinplorer(wallet, asset);
}

async function solRpc(url: string, method: string, params: unknown[]) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error(`Solana RPC returned HTTP ${response.status}.`);
  const json = await response.json();
  if (json.error) throw new Error(json.error.message || 'Solana RPC request failed.');
  return json.result;
}

async function fetchSolanaHistory(network: Network, wallet: string, asset: Token): Promise<WalletActivity[]> {
  const rpc = getSolanaRpcEndpoint(network);
  let addresses = [wallet];
  const tokenAccountSet = new Set<string>();
  if (asset.contractAddress) {
    const tokenAccounts = await solRpc(rpc, 'getTokenAccountsByOwner', [wallet, { mint: asset.contractAddress }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    addresses = (tokenAccounts?.value || []).map((item: any) => item.pubkey);
    addresses.forEach((address: string) => tokenAccountSet.add(address));
    if (!addresses.length) return [];
  }
  const signaturePages = await Promise.all(addresses.map((address) =>
    solRpc(rpc, 'getSignaturesForAddress', [address, { limit: 50, commitment: 'confirmed' }])
  ));
  const unique = new Map<string, any>();
  signaturePages.flat().forEach((item: any) => unique.set(item.signature, item));
  const recent = [...unique.values()].sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0)).slice(0, 50);
  const detailed: any[] = [];
  for (let i = 0; i < recent.length; i += 8) {
    const batch = await Promise.all(recent.slice(i, i + 8).map(async (item) => {
      try {
        const tx = await solRpc(rpc, 'getTransaction', [item.signature, {
          commitment: 'confirmed', encoding: 'jsonParsed', maxSupportedTransactionVersion: 0,
        }]);
        return { signatureInfo: item, transaction: tx };
      } catch { return { signatureInfo: item, transaction: null }; }
    }));
    detailed.push(...batch);
  }
  return detailed.map(({ signatureInfo, transaction }) => {
    const meta = transaction?.meta;
    const keys = transaction?.transaction?.message?.accountKeys || [];
    const keyAddress = (key: any) => typeof key === 'string' ? key : String(key?.pubkey || '');
    const walletIndex = keys.findIndex((key: any) => keyAddress(key) === wallet);
    let amount: string | undefined;
    let direction: WalletActivity['direction'] = 'contract';
    let title = asset.contractAddress ? 'Token contract interaction' : 'Solana program interaction';

    if (asset.contractAddress && meta) {
      const balances = (list: any[]) => (list || [])
        .filter((entry: any) => entry.mint === asset.contractAddress &&
          (entry.owner === wallet || tokenAccountSet.has(keyAddress(keys[entry.accountIndex]))))
        .reduce((sum: bigint, entry: any) => sum + BigInt(entry.uiTokenAmount?.amount || '0'), 0n);
      const before = balances(meta.preTokenBalances);
      const after = balances(meta.postTokenBalances);
      const delta = after - before;
      if (delta > 0n) {
        direction = 'in';
        title = `Received ${asset.symbol}`;
        amount = formatAmount(delta, asset.decimals ?? 0, asset.symbol);
      } else if (delta < 0n) {
        direction = 'out';
        title = `Sent ${asset.symbol}`;
        amount = formatAmount(-delta, asset.decimals ?? 0, asset.symbol);
      }
    } else if (!asset.contractAddress && meta && walletIndex >= 0) {
      const delta = BigInt(meta.postBalances?.[walletIndex] || 0) - BigInt(meta.preBalances?.[walletIndex] || 0);
      const fee = BigInt(meta.fee || 0);
      const transfer = delta < 0n && walletIndex === 0 ? -(delta + fee) : delta;
      if (transfer > 0n) {
        direction = 'in';
        title = 'Received SOL';
        amount = formatAmount(transfer, 9, 'SOL');
      } else if (transfer < 0n) {
        direction = 'out';
        title = 'Sent SOL';
        amount = formatAmount(-transfer, 9, 'SOL');
      }
    }
    const failed = Boolean(signatureInfo.err || meta?.err);
    return {
      id: signatureInfo.signature,
      hash: signatureInfo.signature,
      timestamp: signatureInfo.blockTime || transaction?.blockTime || null,
      title: failed ? 'Failed transaction' : title,
      subtitle: `Slot ${signatureInfo.slot}`,
      amount,
      direction,
      status: failed ? 'failed' : 'success',
      explorerUrl: `https://explorer.solana.com/tx/${signatureInfo.signature}${network === 'testnet' ? '?cluster=devnet' : ''}`,
    } as WalletActivity;
  });
}

export async function fetchAssetHistory(chain: Blockchain, network: Network, wallet: string, asset: Token): Promise<WalletActivity[]> {
  if (!wallet) throw new Error('Wallet address is unavailable.');
  if (chain === 'solana') return fetchSolanaHistory(network, wallet, asset);
  return fetchEvmHistory(chain, network, wallet, asset);
}
