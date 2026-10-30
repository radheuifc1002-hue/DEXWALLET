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

const CHAIN_ID: Record<Exclude<Blockchain, 'solana'>, number> = { ethereum: 1, bnb: 56, polygon: 137 };
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

async function routescan(chain: Exclude<Blockchain, 'solana'>, network: Network, params: Record<string, string>) {
  const chainId = CHAIN_ID[chain];
  const url = new URL(`https://api.routescan.io/v2/network/${network === 'mainnet' ? 'mainnet' : 'testnet'}/evm/${chainId}/etherscan/api`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (response.status === 403) throw new Error('The transaction data provider denied this request (HTTP 403). Please try again later.');
  if (!response.ok) throw new Error(`Transaction history service returned HTTP ${response.status}.`);
  const body = await response.json();
  if (body.status === '0' && body.message !== 'No transactions found') {
    throw new Error(body.result || body.message || 'Unable to retrieve transaction history.');
  }
  return Array.isArray(body.result) ? body.result : [];
}

function formatEvmRows(rows: any[], chain: Blockchain, network: Network, wallet: string, symbol: string, contract?: string): WalletActivity[] {
  return rows.map((tx) => {
    const from = String(tx.from || '').toLowerCase();
    const to = String(tx.to || '').toLowerCase();
    const mine = wallet.toLowerCase();
    const direction = from === mine && to === mine ? 'self' : from === mine ? 'out' : to === mine ? 'in' : 'contract';
    const failed = tx.isError === '1' || tx.txreceipt_status === '0';
    const amount = tx.value && tx.value !== '0' ? (Number(tx.value) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6 }) : undefined;
    const hash = String(tx.hash || tx.transactionHash || '');
    return {
      id: hash + (tx.traceId || tx.logIndex || ''),
      hash,
      timestamp: Number(tx.timeStamp || 0) || null,
      title: contract ? (tx.tokenName ? `${tx.tokenName} transfer` : 'Token interaction') : (direction === 'contract' ? 'Contract interaction' : direction === 'in' ? 'Received' : direction === 'out' ? 'Sent' : 'Self transfer'),
      subtitle: contract ? `${String(tx.from || '').slice(0, 8)}… → ${String(tx.to || '').slice(0, 8)}…` : (direction === 'contract' ? `Contract: ${String(tx.to || '').slice(0, 10)}…` : `${direction === 'in' ? 'From' : 'To'} ${(direction === 'in' ? String(tx.from || '') : String(tx.to || '')).slice(0, 8)}…`),
      amount: tx.tokenDecimal ? `${(Number(tx.value || 0) / (10 ** Number(tx.tokenDecimal))).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tx.tokenSymbol || symbol}` : amount ? `${amount} ${symbol}` : undefined,
      direction,
      status: failed ? 'failed' : 'success',
      explorerUrl: `${EXPLORER[chain][network]}/tx/${hash}`,
    } as WalletActivity;
  });
}

async function fetchEvmHistory(chain: Exclude<Blockchain, 'solana'>, network: Network, wallet: string, asset: Token): Promise<WalletActivity[]> {
  const base = { module: 'account', address: wallet, page: '1', offset: '50', sort: 'desc' };
  if (asset.contractAddress) {
    const contract = asset.contractAddress.toLowerCase();
    const [normal, tokenTransfers] = await Promise.all([
      routescan(chain, network, { ...base, action: 'txlist' }),
      routescan(chain, network, { ...base, action: 'tokentx', contractaddress: contract }),
    ]);
    const interactions = normal.filter((tx: any) => String(tx.to || '').toLowerCase() === contract || String(tx.from || '').toLowerCase() === contract);
    const merged = new Map<string, any>();
    [...interactions, ...tokenTransfers].forEach((tx: any) => {
      const hash = String(tx.hash || tx.transactionHash || '');
      if (hash) merged.set(hash + String(tx.logIndex ?? 'call'), tx);
    });
    return formatEvmRows([...merged.values()], chain, network, wallet, asset.symbol, contract)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 50);
  }
  const [normal, internal, tokenTransfers] = await Promise.all([
    routescan(chain, network, { ...base, action: 'txlist' }),
    routescan(chain, network, { ...base, action: 'txlistinternal' }).catch(() => []),
    routescan(chain, network, { ...base, action: 'tokentx' }).catch(() => []),
  ]);
  const all = new Map<string, any>();
  [...normal, ...internal, ...tokenTransfers].forEach((tx: any) => {
    const hash = String(tx.hash || tx.transactionHash || '');
    const key = hash + String(tx.logIndex ?? tx.traceId ?? (tx.tokenSymbol || 'native'));
    if (hash) all.set(key, tx);
  });
  return formatEvmRows([...all.values()], chain, network, wallet, asset.symbol)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 50);
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
  if (asset.contractAddress) {
    const tokenAccounts = await solRpc(rpc, 'getTokenAccountsByOwner', [wallet, { mint: asset.contractAddress }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    addresses = (tokenAccounts?.value || []).map((item: any) => item.pubkey);
    if (!addresses.length) return [];
  }
  const signatures = await Promise.all(addresses.map(async (address) =>
    solRpc(rpc, 'getSignaturesForAddress', [address, { limit: 50 }, { commitment: 'confirmed' }])
  ));
  const unique = new Map<string, any>();
  signatures.flat().forEach((item: any) => unique.set(item.signature, item));
  return [...unique.values()].sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0)).slice(0, 50).map((item) => ({
    id: item.signature,
    hash: item.signature,
    timestamp: item.blockTime || null,
    title: item.err ? 'Failed transaction' : asset.contractAddress ? 'Token account activity' : 'Solana transaction',
    subtitle: `Slot ${item.slot}`,
    direction: 'contract',
    status: item.err ? 'failed' : 'success',
    explorerUrl: `https://explorer.solana.com/tx/${item.signature}${network === 'testnet' ? '?cluster=devnet' : ''}`,
  }));
}

export async function fetchAssetHistory(chain: Blockchain, network: Network, wallet: string, asset: Token): Promise<WalletActivity[]> {
  if (!wallet) throw new Error('Wallet address is unavailable.');
  if (chain === 'solana') return fetchSolanaHistory(network, wallet, asset);
  return fetchEvmHistory(chain, network, wallet, asset);
}
