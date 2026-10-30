import type { Blockchain } from '../../context/WalletContext';

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

const DEFAULT_LIMIT = 50;
const TIMEOUT_MS = 12000;
const EXPLORERS: Record<Blockchain, Record<'mainnet' | 'testnet', string>> = {
  ethereum: {
    mainnet: 'https://etherscan.io/tx/',
    testnet: 'https://sepolia.etherscan.io/tx/',
  },
  bnb: {
    mainnet: 'https://bscscan.com/tx/',
    testnet: 'https://testnet.bscscan.com/tx/',
  },
  polygon: {
    mainnet: 'https://polygonscan.com/tx/',
    testnet: 'https://amoy.polygonscan.com/tx/',
  },
  solana: {
    mainnet: 'https://solscan.io/tx/',
    testnet: 'https://solscan.io/tx/',
  },
};

function shortAddress(value: string) {
  return value.length > 22 ? value.slice(0, 10) + '…' + value.slice(-8) : value;
}

function amountFromRaw(value: unknown, decimals: unknown) {
  const raw = Number(value || 0);
  const places = Math.max(0, Math.min(36, Number(decimals ?? 18)));
  const amount = raw / Math.pow(10, places);
  return Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { maximumFractionDigits: 6 })
    : '';
}

function seconds(value: unknown) {
  if (typeof value === 'string' && value.includes('T')) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
  }
  const parsed = Number(value || 0);
  return parsed > 1000000000000 ? Math.floor(parsed / 1000) : parsed;
}

function explorerUrl(chain: Blockchain, network: 'mainnet' | 'testnet', hash: string) {
  return EXPLORERS[chain][network] + hash;
}

async function getJson(url: string): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        const message = 'History provider returned HTTP ' + response.status + '.';
        // Retry only transient failures. A 400/401/403/404 is a provider or
        // configuration problem and should fail over immediately.
        if (response.status !== 408 && response.status !== 429 && response.status < 500) {
          throw Object.assign(new Error(message), { nonRetryable: true });
        }
        throw new Error(message);
      }
      const json = await response.json();
      if (json && typeof json === 'object' && json.error) {
        throw new Error(String(json.error.message || 'History provider returned an API error.'));
      }
      return json;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error('History provider request failed.');
      if (error?.nonRetryable || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * Math.pow(2, attempt)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('History provider request failed.');
}

function parseEtherscanResult(json: any, label: string): any[] {
  if (Array.isArray(json?.result)) return json.result;
  const message = String(json?.result || json?.message || '');
  if (/no transactions found|no records found|no data found/i.test(message)) return [];
  if (json?.status === '0' || json?.error) {
    throw new Error(label + ': ' + (message || 'provider rejected the request'));
  }
  throw new Error(label + ': unexpected response format');
}

function mapEvmRow(row: any, wallet: string, symbol: string, token: boolean, chain: Blockchain, network: 'mainnet' | 'testnet'): EvmHistoryRow {
  const from = String(row.from?.hash || row.from || '');
  const to = String(row.to?.hash || row.to || '');
  const incoming = from.toLowerCase() !== wallet.toLowerCase();
  const hash = String(row.hash || row.transaction_hash || row.transactionHash || '');
  const tokenSymbol = token ? String(row.tokenSymbol || row.token?.symbol || symbol) : symbol;
  const decimals = token ? (row.tokenDecimal ?? row.token?.decimals ?? 18) : 18;
  const rawValue = row.value ?? row.total?.value ?? '0';
  const amount = amountFromRaw(rawValue, decimals);
  const failed = String(row.isError || '').toLowerCase() === '1' ||
    String(row.txreceipt_status || '').toLowerCase() === '0' ||
    ['error', 'failed', 'reverted'].includes(String(row.result || row.status || '').toLowerCase());
  const timestamp = seconds(row.timeStamp ?? row.timestamp ?? row.block_timestamp);
  const tokenName = String(row.tokenName || row.token?.name || tokenSymbol);
  const logIndex = row.logIndex ?? row.log_index ?? row.transactionIndex ?? 'transfer';
  return {
    id: hash + (token ? ':token:' + String(logIndex) : ':native'),
    hash,
    title: token ? 'Token ' + (incoming ? 'received' : 'sent') : (incoming ? 'Received ' : 'Sent ') + tokenSymbol,
    detail: token
      ? tokenName + ' · ' + (incoming ? 'From ' + shortAddress(from) : 'To ' + shortAddress(to))
      : (incoming ? 'From ' + shortAddress(from) : 'To ' + shortAddress(to)),
    amount: amount ? amount + ' ' + tokenSymbol : '',
    timestamp,
    incoming,
    failed,
    explorerUrl: explorerUrl(chain, network, hash),
  };
}

function etherscanBase(chain: Exclude<Blockchain, 'solana'>, network: 'mainnet' | 'testnet') {
  if (chain === 'ethereum') {
    return network === 'mainnet'
      ? 'https://api.routescan.io/v2/network/mainnet/evm/1/etherscan/api'
      : 'https://api.routescan.io/v2/network/testnet/evm/11155111/etherscan/api';
  }
  if (chain === 'polygon') {
    return network === 'mainnet' ? 'https://api.polygonscan.com/api' : 'https://api-amoy.polygonscan.com/api';
  }
  return network === 'mainnet' ? 'https://api.bscscan.com/api' : 'https://api-testnet.bscscan.com/api';
}

async function fetchEtherscanStyle(options: Options): Promise<EvmHistoryRow[]> {
  const { chain, network, walletAddress, contractAddress, isNative, name, symbol } = options;
  const base = etherscanBase(chain, network);
  const env = (globalThis as any).process?.env || {};
  const key = chain === 'polygon'
    ? env.EXPO_PUBLIC_POLYGONSCAN_API_KEY
    : chain === 'bnb'
      ? env.EXPO_PUBLIC_BSCSCAN_API_KEY
      : env.EXPO_PUBLIC_ETHERSCAN_API_KEY;
  const common = '&address=' + encodeURIComponent(walletAddress) +
    '&startblock=0&endblock=99999999&page=1&offset=' + (options.limit || DEFAULT_LIMIT) + '&sort=desc';
  if (chain !== 'ethereum' && !key) {
    throw new Error(chain.toUpperCase() + ' explorer API key is not configured.');
  }
  const auth = key ? '&apikey=' + encodeURIComponent(key) : '';
  const request = async (action: string, extra = '') => {
    const json = await getJson(base + '?module=account&action=' + action + common + extra + auth);
    return parseEtherscanResult(json, action);
  };

  const nativePromise = request('txlist');
  const tokenPromise = isNative ? Promise.resolve([]) : request('tokentx', '&contractaddress=' + encodeURIComponent(contractAddress));
  let nativeResult: PromiseSettledResult<any[]>;
  let tokenResult: PromiseSettledResult<any[]>;
  if (!isNative && !key && chain !== 'ethereum') {
    nativeResult = await nativePromise.then(
      (value) => ({ status: 'fulfilled', value } as const),
      (reason) => ({ status: 'rejected', reason } as const)
    );
    // Keyless PolygonScan/BscScan access is deliberately throttled to avoid
    // turning the provider's low anonymous quota into a second failed request.
    await new Promise((resolve) => setTimeout(resolve, 5200));
    tokenResult = await tokenPromise.then(
      (value) => ({ status: 'fulfilled', value } as const),
      (reason) => ({ status: 'rejected', reason } as const)
    );
  } else {
    [nativeResult, tokenResult] = await Promise.allSettled([nativePromise, tokenPromise]);
  }
  if (nativeResult.status === 'rejected' && tokenResult.status === 'rejected') {
    throw new Error(String(nativeResult.reason?.message || tokenResult.reason?.message || 'History provider failed.'));
  }

  const nativeRows = nativeResult.status === 'fulfilled' ? nativeResult.value : [];
  const tokenRows = tokenResult.status === 'fulfilled' ? tokenResult.value : [];
  const contractRows = isNative ? nativeRows : nativeRows.filter((row: any) =>
    String(row.to || '').toLowerCase() === contractAddress.toLowerCase() ||
    String(row.from || '').toLowerCase() === contractAddress.toLowerCase()
  );
  const rows = contractRows.map((row: any) => {
    const mapped = mapEvmRow(row, walletAddress, isNative ? symbol : symbol, false, chain, network);
    return isNative ? mapped : { ...mapped, title: 'Contract interaction', detail: 'Called ' + name + ' contract', amount: '' };
  });
  rows.push(...tokenRows.map((row: any) => mapEvmRow(row, walletAddress, symbol, true, chain, network)));
  return rows;
}

async function fetchEtherscanV2(options: Options): Promise<EvmHistoryRow[]> {
  // Etherscan V2 supports the configured Ethereum and Polygon testnets too.
  const key = (globalThis as any).process?.env?.EXPO_PUBLIC_ETHERSCAN_API_KEY;
  if (!key) throw new Error('Etherscan V2 fallback is not configured.');
  const chainIds = options.network === 'mainnet'
    ? { ethereum: 1, bnb: 56, polygon: 137 }
    : { ethereum: 11155111, bnb: 97, polygon: 80002 };
  const base = 'https://api.etherscan.io/v2/api?chainid=' + chainIds[options.chain];
  const common = '&address=' + encodeURIComponent(options.walletAddress) +
    '&startblock=0&endblock=99999999&page=1&offset=' + (options.limit || DEFAULT_LIMIT) + '&sort=desc&apikey=' + encodeURIComponent(key);
  const request = async (action: string, extra = '') => {
    const json = await getJson(base + '&module=account&action=' + action + common + extra);
    return parseEtherscanResult(json, action);
  };
  const [nativeResult, tokenResult] = await Promise.allSettled([
    request('txlist'),
    options.isNative ? Promise.resolve([]) : request('tokentx', '&contractaddress=' + encodeURIComponent(options.contractAddress)),
  ]);
  if (nativeResult.status === 'rejected' && tokenResult.status === 'rejected') {
    throw new Error(String(nativeResult.reason?.message || tokenResult.reason?.message || 'Etherscan V2 failed.'));
  }
  const nativeRows = nativeResult.status === 'fulfilled' ? nativeResult.value : [];
  const tokenRows = tokenResult.status === 'fulfilled' ? tokenResult.value : [];
  const contractRows = options.isNative ? nativeRows : nativeRows.filter((row: any) =>
    String(row.to || '').toLowerCase() === options.contractAddress.toLowerCase() ||
    String(row.from || '').toLowerCase() === options.contractAddress.toLowerCase()
  );
  const rows = contractRows.map((row: any) => {
    const mapped = mapEvmRow(row, options.walletAddress, options.symbol, false, options.chain, options.network);
    return options.isNative ? mapped : { ...mapped, title: 'Contract interaction', detail: 'Called ' + options.name + ' contract', amount: '' };
  });
  rows.push(...tokenRows.map((row: any) => mapEvmRow(row, options.walletAddress, options.symbol, true, options.chain, options.network)));
  return rows;
}
 
async function fetchBlockscout(options: Options): Promise<EvmHistoryRow[]> {
  const hosts: Record<'ethereum' | 'polygon', Record<'mainnet' | 'testnet', string>> = {
    ethereum: {
      mainnet: 'https://eth.blockscout.com/api/v2',
      testnet: 'https://eth-sepolia.blockscout.com/api/v2',
    },
    polygon: {
      mainnet: 'https://polygon.blockscout.com/api/v2',
      // Amoy is not currently served by the public Polygon Blockscout instance.
      // It is handled by the configured Polygonscan/Etherscan API key fallback.
      testnet: '',
    },
  };
  if (options.chain === 'bnb') throw new Error('No public Blockscout indexer is configured for BNB Smart Chain.');
  const host = hosts[options.chain][options.network];
  if (!host) throw new Error('No public Blockscout indexer is configured for this network.');
  const addressPath = '/addresses/' + encodeURIComponent(options.walletAddress);
  const txUrl = host + addressPath + '/transactions';
  const tokenUrl = host + addressPath + '/token-transfers?type=ERC-20&token=' +
    encodeURIComponent(options.contractAddress);

  const [txResult, tokenResult] = await Promise.allSettled([
    getJson(txUrl),
    options.isNative ? Promise.resolve({ items: [] }) : getJson(tokenUrl),
  ]);
  if (txResult.status === 'rejected' || tokenResult.status === 'rejected') {
    const failure = txResult.status === 'rejected' ? txResult.reason : (tokenResult as PromiseRejectedResult).reason;
    throw new Error('Blockscout indexer failed: ' + String(failure?.message || 'request failed'));
  }
  if (!Array.isArray(txResult.value?.items) || !Array.isArray(tokenResult.value?.items)) {
    throw new Error('Blockscout returned an unexpected history response.');
  }

  const txRows = txResult.value.items;
  const tokenRows = tokenResult.value.items;
  const contractRows = options.isNative ? txRows : txRows.filter((row: any) =>
    String(row.to?.hash || '').toLowerCase() === options.contractAddress.toLowerCase() ||
    String(row.from?.hash || '').toLowerCase() === options.contractAddress.toLowerCase()
  );
  const rows = contractRows.map((row: any) => {
    const mapped = mapEvmRow(row, options.walletAddress, options.symbol, false, options.chain, options.network);
    return options.isNative
      ? mapped
      : { ...mapped, title: 'Contract interaction', detail: 'Called ' + options.name + ' contract', amount: '' };
  });
  rows.push(...tokenRows.map((row: any) =>
    mapEvmRow(row, options.walletAddress, options.symbol, true, options.chain, options.network)
  ));
  return rows;
}

export async function fetchEvmAssetHistory(options: Options): Promise<EvmHistoryRow[]> {
  if (!options.walletAddress) throw new Error('Wallet address is missing for this network.');
  if (!options.isNative && !/^0x[a-fA-F0-9]{40}$/.test(options.contractAddress)) {
    throw new Error('Token contract address is invalid for this EVM network.');
  }

  const providers: Array<() => Promise<EvmHistoryRow[]>> = [];
  // Prefer the chain's own indexed API for Ethereum and Polygon mainnet.
  // Keep independent explorer APIs as failovers instead of relying on a
  // single Etherscan-compatible gateway that may reject a chain ID.
  if (options.chain === 'ethereum' || options.chain === 'polygon') {
    providers.push(() => fetchBlockscout(options));
  }
  providers.push(() => fetchEtherscanStyle(options));
  providers.push(() => fetchEtherscanV2(options));

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const rows = await provider();
      const unique = new Map<string, EvmHistoryRow>();
      for (const row of rows) {
        if (row.hash && row.id) unique.set(row.id, row);
      }
      return Array.from(unique.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, options.limit || DEFAULT_LIMIT);
    } catch (error: any) {
      errors.push(error?.message || 'Unknown provider error');
    }
  }
  throw new Error('History providers are temporarily unavailable for ' + options.chain.toUpperCase() + '. ' + errors.join(' | '));
}
