import type { Blockchain } from '../../context/WalletContext';
import { getEvmRpcConfig } from './rpcManager';

export type EvmHistoryRow = {
  id: string;
  hash: string;
  title: string;
  detail: string;
  amount: string;
  timestamp: number;
  incoming: boolean;
  failed: boolean;
  explorerUrl: string;
};

type Options = {
  chain: Exclude<Blockchain, 'solana'>;
  network: 'mainnet' | 'testnet';
  walletAddress: string;
  contractAddress: string;
  isNative: boolean;
  name: string;
  symbol: string;
  limit?: number;
};

const EXPLORERS: Record<Exclude<Blockchain, 'solana'>, Record<'mainnet' | 'testnet', string>> = {
  ethereum: { mainnet: 'https://etherscan.io/tx/', testnet: 'https://sepolia.etherscan.io/tx/' },
  bnb: { mainnet: 'https://bscscan.com/tx/', testnet: 'https://testnet.bscscan.com/tx/' },
  polygon: { mainnet: 'https://polygonscan.com/tx/', testnet: 'https://amoy.polygonscan.com/tx/' },
};

async function requestTransfers(
  endpoint: string,
  address: string,
  direction: 'fromAddress' | 'toAddress',
  category: string[],
  contractAddress?: string,
): Promise<any[]> {
  const transferFilter: Record<string, unknown> = {
    [direction]: address,
    fromBlock: '0x0',
    toBlock: 'latest',
    category,
    withMetadata: true,
    excludeZeroValue: false,
    maxCount: '0x32',
    order: 'desc',
  };
  if (contractAddress) transferFilter.contractAddresses = [contractAddress];

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: direction + ':' + category.join(','),
      method: 'alchemy_getAssetTransfers',
      params: [transferFilter],
    }),
  });
  if (!response.ok) throw new Error('Alchemy history returned HTTP ' + response.status + '.');
  const json = await response.json();
  if (json?.error) throw new Error(String(json.error.message || 'Alchemy could not return wallet history.'));
  if (!Array.isArray(json?.result?.transfers)) {
    throw new Error('Alchemy returned an invalid asset-transfer response.');
  }
  return json.result.transfers;
}

function mapTransfer(
  transfer: any,
  options: Options,
  contractInteraction = false,
): EvmHistoryRow {
  const from = String(transfer.from || '');
  const to = String(transfer.to || '');
  const incoming = to.toLowerCase() === options.walletAddress.toLowerCase();
  const hash = String(transfer.hash || '');
  const tokenTransfer = String(transfer.category || '').toLowerCase() === 'erc20';
  const symbol = tokenTransfer ? String(transfer.asset || options.symbol || 'TOKEN') : options.symbol;
  const value = transfer.value == null ? '' : String(transfer.value);
  const timestamp = Date.parse(transfer.metadata?.blockTimestamp || '');
  const tokenName = String(transfer.rawContract?.address || options.contractAddress || '');
  const id = String(transfer.uniqueId || [
    hash, transfer.category, transfer.rawContract?.address, from, to,
  ].join(':'));

  return {
    id,
    hash,
    title: contractInteraction ? 'Contract interaction' : (incoming ? 'Received ' : 'Sent ') + symbol,
    detail: contractInteraction
      ? 'Called ' + options.name + ' · ' + (incoming ? 'From ' : 'To ') + (incoming ? from : to)
      : tokenTransfer
        ? (tokenName ? tokenName.slice(0, 8) + '… · ' : '') + (incoming ? 'From ' + from : 'To ' + to)
        : (incoming ? 'From ' + from : 'To ' + to),
    amount: contractInteraction ? '' : value ? value + ' ' + symbol : '',
    timestamp: Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0,
    incoming,
    failed: false,
    explorerUrl: EXPLORERS[options.chain][options.network] + hash,
  };
}

export async function fetchEvmAssetHistory(options: Options): Promise<EvmHistoryRow[]> {
  if (!options.walletAddress) throw new Error('Wallet address is missing for this network.');
  if (!options.isNative && !/^0x[a-fA-F0-9]{40}$/.test(options.contractAddress)) {
    throw new Error('Token contract address is invalid for this EVM network.');
  }

  const endpoint = getEvmRpcConfig(options.chain, options.network).rpc;
  const limit = Math.min(50, Math.max(1, options.limit || 50));

  const requests = options.isNative
    ? [
        requestTransfers(endpoint, options.walletAddress, 'fromAddress', ['external', 'internal']),
        requestTransfers(endpoint, options.walletAddress, 'toAddress', ['external', 'internal']),
      ]
    : [
        requestTransfers(endpoint, options.walletAddress, 'fromAddress', ['erc20'], options.contractAddress),
        requestTransfers(endpoint, options.walletAddress, 'toAddress', ['erc20'], options.contractAddress),
        requestTransfers(endpoint, options.walletAddress, 'fromAddress', ['external', 'internal']),
        requestTransfers(endpoint, options.walletAddress, 'toAddress', ['external', 'internal']),
      ];

  const results = await Promise.all(requests);
  const tokenRows = options.isNative ? [] : results.slice(0, 2).flat();
  const interactionRows = options.isNative ? [] : results.slice(2).flat().filter((row: any) =>
    String(row.to || '').toLowerCase() === options.contractAddress.toLowerCase() ||
    String(row.from || '').toLowerCase() === options.contractAddress.toLowerCase()
  );
  const nativeRows = options.isNative ? results.flat() : [];
  const seen = new Set<string>();
  const rows = (options.isNative ? nativeRows : tokenRows.concat(interactionRows)).filter((row: any) => {
    const id = String(row.uniqueId || [row.hash, row.category, row.rawContract?.address, row.from, row.to].join(':'));
    if (!row.hash || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map((row: any) => mapTransfer(row, options, !options.isNative && !tokenRows.includes(row)));

  return rows.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}
