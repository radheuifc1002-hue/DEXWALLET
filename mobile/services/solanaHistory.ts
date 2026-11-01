export type SolanaHistoryRow = {
  id: string;
  hash: string;
  title: string;
  detail: string;
  amount: string;
  timestamp: number;
  incoming: boolean;
  failed: boolean;
  explorerUrl: string;
  assetType: 'native' | 'token';
  mintAddress: string | null;
};

type SolanaHistoryOptions = {
  network: 'mainnet' | 'testnet';
  walletAddress: string;
  isNative: boolean;
  mintAddress?: string;
  before?: string;
  limit?: number;
};

const HISTORY_API = 'https://dexwallet-api.vercel.app/api/solana-history';

export async function fetchSolanaAssetHistory(options: SolanaHistoryOptions): Promise<{
  rows: SolanaHistoryRow[];
  nextBefore: string | null;
  hasMore: boolean;
  complete: boolean;
}> {
  if (!options.walletAddress) throw new Error('Wallet address is missing for Solana.');
  if (!options.isNative && !options.mintAddress) throw new Error('Token mint address is missing.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(HISTORY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        network: options.network,
        walletAddress: options.walletAddress,
        isNative: options.isNative,
        mintAddress: options.isNative ? undefined : options.mintAddress,
        before: options.before,
        limit: Math.min(50, Math.max(1, options.limit || 50)),
      }),
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error('Solana transaction history is temporarily unavailable.');
    if (!Array.isArray(payload?.rows)) throw new Error('The Solana history service returned an invalid response.');
    return {
      rows: payload.rows as SolanaHistoryRow[],
      nextBefore: typeof payload.nextBefore === 'string' ? payload.nextBefore : null,
      hasMore: Boolean(payload.hasMore),
      complete: Boolean(payload.complete),
    };
  } finally {
    clearTimeout(timeout);
  }
}
