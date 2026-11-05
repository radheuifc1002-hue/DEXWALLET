import type { Blockchain } from '../../context/WalletContext';

export type EvmHistoryRow = {
  id: string; hash: string; title: string; detail: string; amount: string;
  timestamp: number; incoming: boolean; failed: boolean; status: 'success'|'failed'|'unknown'; explorerUrl: string;
};
export type EvmHistoryResult = { rows:EvmHistoryRow[]; complete:boolean; warning?:string };

type Options = {
  chain: Exclude<Blockchain, 'solana'|'bitcoin'|'tron'>;
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


export type IndexedChainHistoryRow = {
  id: string; hash: string; title: string; subtitle?: string; detail?: string;
  amount: string; timestamp: number; incoming: boolean; status: string; explorerUrl: string;
};
export type IndexedChainHistoryResult = { rows: IndexedChainHistoryRow[]; complete: boolean; source?: string };

export async function fetchIndexedChainHistory(options: {
  chain: 'bitcoin' | 'tron';
  network: 'mainnet' | 'testnet';
  walletAddress: string;
}): Promise<IndexedChainHistoryResult> {
  if (!options.walletAddress) throw new Error('Wallet address is missing for this network.');

  // Bitcoin history resolves up to 50 Alchemy transaction IDs into full UTXO
  // records. That response can take longer than the EVM/TRON history calls,
  // so give the Android client a wider deadline and retry transient failures.
  const attempts = options.chain === 'bitcoin' ? 3 : 1;
  const requestTimeoutMs = options.chain === 'bitcoin' ? 45000 : 25000;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch('https://dexwallet-api.vercel.app/api/chain-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          chain: options.chain,
          network: options.network,
          walletAddress: options.walletAddress.trim(),
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const code = String(payload?.error?.code || '');
        if (code === 'history_provider_not_configured') {
          throw new Error('Bitcoin history provider is not configured on the server.');
        }
        const retryable = options.chain === 'bitcoin'
          && (response.status === 408 || response.status === 425 || response.status === 429
            || response.status === 502 || response.status === 503 || response.status === 504
            || code === 'history_provider_unavailable');
        if (retryable && attempt + 1 < attempts) {
          lastError = new Error('Bitcoin history request failed temporarily (HTTP ' + response.status + ').');
        } else {
          throw new Error('Transaction history is temporarily unavailable. Please try again.');
        }
      } else {
        if (!Array.isArray(payload?.rows)) throw new Error('The history service returned an invalid response.');
        return {
          rows: payload.rows as IndexedChainHistoryRow[],
          complete: Boolean(payload.complete),
          source: String(payload.source || ''),
        };
      }
    } catch (error) {
      lastError = error;
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const isTransientNetworkError = !(error instanceof Error)
        || isAbort
        || /network request failed|fetch failed|temporarily/i.test(error.message);
      if (options.chain !== 'bitcoin' || !isTransientNetworkError || attempt + 1 >= attempts) {
        if (error instanceof Error && error.message !== 'Aborted') throw error;
        throw new Error('Transaction history is temporarily unavailable. Please try again.');
      }
    } finally {
      clearTimeout(timeout);
    }

    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error
    ? new Error('Transaction history is temporarily unavailable. Please try again.')
    : new Error('Could not load Bitcoin transaction history. Please try again.');
}
