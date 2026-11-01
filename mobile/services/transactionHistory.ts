import type { Blockchain } from '../../context/WalletContext';

export type EvmHistoryRow = {
  id: string; hash: string; title: string; detail: string; amount: string;
  timestamp: number; incoming: boolean; failed: boolean; status: 'success'|'failed'|'unknown'; explorerUrl: string;
};
export type EvmHistoryResult = { rows:EvmHistoryRow[]; complete:boolean; warning?:string };

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

const HISTORY_API = 'https://dexwallet-api.vercel.app/api/history';

export async function fetchEvmAssetHistory(options: Options): Promise<EvmHistoryResult> {
  if (!options.walletAddress) throw new Error('Wallet address is missing for this network.');
  if (!options.isNative && !/^0x[a-fA-F0-9]{40}$/.test(options.contractAddress)) {
    throw new Error('Token contract address is invalid for this EVM network.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(HISTORY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        chain: options.chain, network: options.network, walletAddress: options.walletAddress,
        isNative: options.isNative, contractAddress: options.isNative ? undefined : options.contractAddress,
        limit: Math.min(50, Math.max(1, options.limit || 50)),
      }),
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) {
      const code = String(payload?.error?.code || '');
      throw new Error(code === 'history_provider_not_configured'
        ? 'Transaction history provider is not configured on the server.'
        : 'Transaction history is temporarily unavailable. Please try again.');
    }
    if (!Array.isArray(payload?.rows)) throw new Error('The history service returned an invalid response.');
    return {
      rows: payload.rows as EvmHistoryRow[],
      complete: Boolean(payload.complete),
      ...(typeof payload.warning === 'string' ? { warning: payload.warning } : {}),
    };
  } finally {
    clearTimeout(timeout);
  }
}
