import AsyncStorage from '@react-native-async-storage/async-storage';

export type RpcNetwork = 'mainnet' | 'testnet';
export type EvmChain = 'ethereum' | 'bnb' | 'polygon';
export type RpcChain = EvmChain | 'solana';

type EvmEndpoint = { chainId: number; endpoints: string[] };
type RpcConfig = {
  version: number;
  chains: Record<RpcChain, {
    mainnet: EvmEndpoint | { endpoints: string[] };
    testnet: EvmEndpoint | { endpoints: string[] };
  }>;
};

const CONFIG_URL = 'https://dexwallet-omega.vercel.app/api/rpc-config';
const CACHE_KEY = '@xuwallet/rpc-config-v1';
const REQUEST_TIMEOUT_MS = 3500;

const DEFAULT_CONFIG: RpcConfig = {
  version: 1,
  chains: {
    ethereum: {
      mainnet: { chainId: 1, endpoints: ['https://ethereum-rpc.publicnode.com', 'https://eth.api.pocket.network', 'https://eth-mainnet.g.alchemy.com/public'] },
      testnet: { chainId: 11155111, endpoints: ['https://ethereum-sepolia-rpc.publicnode.com', 'https://eth-sepolia-testnet.api.pocket.network'] },
    },
    bnb: {
      mainnet: { chainId: 56, endpoints: ['https://bsc-rpc.publicnode.com', 'https://bsc.api.pocket.network', 'https://bsc-dataseed.bnbchain.org'] },
      testnet: { chainId: 97, endpoints: ['https://bsc-testnet-rpc.publicnode.com', 'https://bsc-testnet-dataseed.bnbchain.org'] },
    },
    polygon: {
      mainnet: { chainId: 137, endpoints: ['https://polygon-bor-rpc.publicnode.com', 'https://poly.api.pocket.network'] },
      testnet: { chainId: 80002, endpoints: ['https://polygon-amoy-bor-rpc.publicnode.com', 'https://poly-amoy-testnet.api.pocket.network'] },
    },
    solana: {
      mainnet: { endpoints: ['https://api.mainnet-beta.solana.com', 'https://solana.api.pocket.network', 'https://api.mainnet.solana.com'] },
      testnet: { endpoints: ['https://api.devnet.solana.com', 'https://solana.api.pocket.network'] },
    },
  },
};

let activeConfig: RpcConfig = DEFAULT_CONFIG;
let initialization: Promise<void> | null = null;

function sanitizeConfig(input: unknown): RpcConfig | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Partial<RpcConfig>;
  if (value.version !== 1 || !value.chains) return null;

  const result = { version: 1, chains: {} } as RpcConfig;
  const chains: RpcChain[] = ['ethereum', 'bnb', 'polygon', 'solana'];
  for (const chain of chains) {
    const candidate = value.chains[chain];
    if (!candidate) return null;
    for (const network of ['mainnet', 'testnet'] as RpcNetwork[]) {
      const entry = candidate[network] as EvmEndpoint | { endpoints: string[] } | undefined;
      if (!entry || !Array.isArray(entry.endpoints) || entry.endpoints.length === 0 || entry.endpoints.length > 6) return null;
      if (!entry.endpoints.every((url) => typeof url === 'string' && url.startsWith('https://'))) return null;
    }
    (result.chains as any)[chain] = candidate;
  }
  return result;
}

/**
 * Loads the remotely managed endpoint registry. The bundled registry remains
 * available if the control-plane API is offline, blocked, or returns bad data.
 */
export function initializeRpcManager(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(CONFIG_URL, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`RPC config returned HTTP ${response.status}`);
        const remote = sanitizeConfig(await response.json());
        if (!remote) throw new Error('RPC config failed validation');
        activeConfig = remote;
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(remote));
        return;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        const parsed = cached ? sanitizeConfig(JSON.parse(cached)) : null;
        if (parsed) activeConfig = parsed;
      } catch {
        // Keep the bundled defaults when neither remote nor cached config works.
      }
    }
  })().finally(() => {
    initialization = null;
  });
  return initialization;
}

export function getEvmRpcConfig(chain: EvmChain, network: RpcNetwork): { chainId: number; rpc: string } {
  const entry = activeConfig.chains[chain][network] as EvmEndpoint;
  return { chainId: entry.chainId, rpc: entry.endpoints[0] };
}

export function getSolanaRpcEndpoint(network: RpcNetwork): string {
  return activeConfig.chains.solana[network].endpoints[0];
}

export function getRpcConfigVersion(): number {
  return activeConfig.version;
}
