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

type EndpointHealth = {
  latencyMs: number;
  consecutiveFailures: number;
  cooldownUntil: number;
  lastCheckedAt: number;
  lastError?: string;
};

type RpcHealthStore = Record<string, EndpointHealth>;
type RpcEndpoint = { url: string; chainId?: number };

const CONFIG_URL = 'https://dexwallet-omega.vercel.app/api/rpc-config';
const CACHE_KEY = '@xuwallet/rpc-config-v1';
const HEALTH_KEY = '@xuwallet/rpc-health-v1';
const REQUEST_TIMEOUT_MS = 4500;
const FAILURE_COOLDOWN_MS = 60_000;
const MAX_FAILURE_COOLDOWN_MS = 15 * 60_000;
const HEALTH_CHECK_INTERVAL_MS = 10 * 60_000;
const HEALTH_FRESHNESS_MS = 90_000;

const EXPECTED_CHAIN_IDS: Record<EvmChain, Record<RpcNetwork, number>> = {
  ethereum: { mainnet: 1, testnet: 11155111 },
  bnb: { mainnet: 56, testnet: 97 },
  polygon: { mainnet: 137, testnet: 80002 },
};

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
      testnet: { endpoints: ['https://api.devnet.solana.com'] },
    },
  },
};

let activeConfig: RpcConfig = DEFAULT_CONFIG;
let health: RpcHealthStore = {};
let initialization: Promise<void> | null = null;
let healthLoaded: Promise<void> | null = null;
let monitorTimer: ReturnType<typeof setInterval> | null = null;

function expectedChainId(chain: EvmChain, network: RpcNetwork) {
  return EXPECTED_CHAIN_IDS[chain][network];
}

function endpointKey(chain: RpcChain, network: RpcNetwork, url: string) {
  return chain + ':' + network + ':' + url;
}

function isValidEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 512) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function sanitizeConfig(input: unknown): RpcConfig | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Partial<RpcConfig>;
  if (value.version !== 1 || !value.chains || typeof value.chains !== 'object') return null;

  const chains: RpcChain[] = ['ethereum', 'bnb', 'polygon', 'solana'];
  const result = { version: 1, chains: {} } as RpcConfig;
  for (const chain of chains) {
    const candidate = value.chains[chain];
    if (!candidate) return null;
    for (const network of ['mainnet', 'testnet'] as RpcNetwork[]) {
      const entry = candidate[network] as EvmEndpoint | { endpoints: string[] } | undefined;
      if (!entry || !Array.isArray(entry.endpoints) || entry.endpoints.length === 0 || entry.endpoints.length > 8) return null;
      if (!entry.endpoints.every(isValidEndpoint)) return null;
      if (chain !== 'solana') {
        const configuredChainId = (entry as EvmEndpoint).chainId;
        if (configuredChainId !== expectedChainId(chain, network)) return null;
      }
    }
    (result.chains as any)[chain] = candidate;
  }
  return result;
}

async function loadHealth() {
  if (healthLoaded) return healthLoaded;
  healthLoaded = (async () => {
    try {
      const stored = await AsyncStorage.getItem(HEALTH_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) health = parsed as RpcHealthStore;
    } catch {
      health = {};
    }
  })();
  return healthLoaded;
}

function persistHealth() {
  void AsyncStorage.setItem(HEALTH_KEY, JSON.stringify(health)).catch(() => {});
}

function markSuccess(chain: RpcChain, network: RpcNetwork, url: string, latencyMs: number) {
  health[endpointKey(chain, network, url)] = {
    latencyMs,
    consecutiveFailures: 0,
    cooldownUntil: 0,
    lastCheckedAt: Date.now(),
  };
  persistHealth();
}

function markFailure(chain: RpcChain, network: RpcNetwork, url: string, error: unknown) {
  const key = endpointKey(chain, network, url);
  const previous = health[key];
  const failures = (previous?.consecutiveFailures || 0) + 1;
  const cooldown = Math.min(MAX_FAILURE_COOLDOWN_MS, FAILURE_COOLDOWN_MS * Math.pow(2, failures - 1));
  health[key] = {
    latencyMs: previous?.latencyMs ?? Number.MAX_SAFE_INTEGER,
    consecutiveFailures: failures,
    cooldownUntil: Date.now() + cooldown,
    lastCheckedAt: Date.now(),
    lastError: error instanceof Error ? error.message.slice(0, 180) : 'Endpoint request failed',
  };
  persistHealth();
}

function getEndpoints(chain: RpcChain, network: RpcNetwork): RpcEndpoint[] {
  const entry = activeConfig.chains[chain][network];
  const chainId = chain === 'solana' ? undefined : (entry as EvmEndpoint).chainId;
  const now = Date.now();
  const endpoints = entry.endpoints.map((url, index) => ({
    url,
    chainId,
    index,
    state: health[endpointKey(chain, network, url)],
  }));
  const healthy = endpoints.filter((item) => !item.state || item.state.cooldownUntil <= now);
  const candidates = healthy.length > 0 ? healthy : endpoints;
  return candidates
    .sort((a, b) => {
      const aLatency = a.state?.latencyMs ?? Number.MAX_SAFE_INTEGER;
      const bLatency = b.state?.latencyMs ?? Number.MAX_SAFE_INTEGER;
      return aLatency - bLatency || a.index - b.index;
    })
    .map(({ url, chainId: id }) => ({ url, chainId: id }));
}

async function postJsonRpc(url: string, method: string, params: unknown[] = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('RPC returned HTTP ' + response.status);
    const json = await response.json();
    if (json?.error) throw new Error(String(json.error.message || 'RPC returned an error'));
    if (!Object.prototype.hasOwnProperty.call(json || {}, 'result')) throw new Error('RPC returned an invalid JSON-RPC response');
    return json.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyEndpoint(chain: RpcChain, network: RpcNetwork, endpoint: RpcEndpoint) {
  const started = Date.now();
  if (chain === 'solana') {
    const result = await postJsonRpc(endpoint.url, 'getHealth');
    if (result !== 'ok') throw new Error('Solana RPC health check did not return ok');
  } else {
    const result = await postJsonRpc(endpoint.url, 'eth_chainId');
    const actual = Number(BigInt(String(result)));
    if (actual !== expectedChainId(chain, network)) {
      throw new Error('Wrong chain ID: expected ' + expectedChainId(chain, network) + ', received ' + actual);
    }
  }
  const latency = Date.now() - started;
  markSuccess(chain, network, endpoint.url, latency);
  return latency;
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
        if (!response.ok) throw new Error('RPC config returned HTTP ' + response.status);
        const remote = sanitizeConfig(await response.json());
        if (!remote) throw new Error('RPC config failed validation');
        activeConfig = remote;
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(remote));
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        const parsed = cached ? sanitizeConfig(JSON.parse(cached)) : null;
        if (parsed) activeConfig = parsed;
      } catch {
        // Keep bundled defaults if neither remote nor cached config works.
      }
    }
    await loadHealth();
  })().finally(() => {
    initialization = null;
  });
  return initialization;
}

/** Returns endpoints ordered by measured health/latency for this device. */
export function getEvmRpcEndpoints(chain: EvmChain, network: RpcNetwork): RpcEndpoint[] {
  return getEndpoints(chain, network);
}

export function getSolanaRpcEndpoints(network: RpcNetwork): string[] {
  return getEndpoints('solana', network).map((endpoint) => endpoint.url);
}

/** Backwards-compatible synchronous accessor. Prefer getEvmRpcEndpoints for new code. */
export function getEvmRpcConfig(chain: EvmChain, network: RpcNetwork): { chainId: number; rpc: string } {
  const endpoint = getEndpoints(chain, network)[0];
  return { chainId: endpoint.chainId as number, rpc: endpoint.url };
}

export function getSolanaRpcEndpoint(network: RpcNetwork): string {
  return getEndpoints('solana', network)[0].url;
}

/**
 * Measures endpoints from this device. No RPC traffic is proxied through Vercel.
 * Call on app foreground or after a provider failure, not on every screen render.
 */
export async function refreshRpcHealth(chain: RpcChain, network: RpcNetwork): Promise<void> {
  await initializeRpcManager();
  const endpoints = getEndpoints(chain, network);
  await Promise.all(endpoints.map(async (endpoint) => {
    try {
      await verifyEndpoint(chain, network, endpoint);
    } catch (error) {
      markFailure(chain, network, endpoint.url, error);
    }
  }));
}

/**
 * Executes an idempotent, read-only EVM operation with endpoint failover.
 * NEVER use this wrapper for transaction submission or any state-changing RPC method.
 */
export async function withEvmReadFallback<T>(
  chain: EvmChain,
  network: RpcNetwork,
  operation: (endpoint: string, chainId: number) => Promise<T>,
): Promise<T> {
  await initializeRpcManager();
  await loadHealth();
  const endpoints = getEndpoints(chain, network);
  let lastError: unknown;
  for (const endpoint of endpoints) {
    const started = Date.now();
    try {
      const previous = health[endpointKey(chain, network, endpoint.url)];
      if (!previous || previous.consecutiveFailures > 0 || Date.now() - previous.lastCheckedAt > HEALTH_FRESHNESS_MS) {
        await verifyEndpoint(chain, network, endpoint);
      }
      const result = await operation(endpoint.url, endpoint.chainId as number);
      markSuccess(chain, network, endpoint.url, Date.now() - started);
      return result;
    } catch (error) {
      lastError = error;
      markFailure(chain, network, endpoint.url, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All configured RPC endpoints failed');
}

/**
 * Executes an idempotent, read-only Solana operation with endpoint failover.
 * NEVER use this wrapper for sendTransaction or other state-changing methods.
 */
export async function withSolanaReadFallback<T>(
  network: RpcNetwork,
  operation: (endpoint: string) => Promise<T>,
): Promise<T> {
  await initializeRpcManager();
  await loadHealth();
  const endpoints = getEndpoints('solana', network);
  let lastError: unknown;
  for (const endpoint of endpoints) {
    const started = Date.now();
    try {
      const previous = health[endpointKey('solana', network, endpoint.url)];
      if (!previous || previous.consecutiveFailures > 0 || Date.now() - previous.lastCheckedAt > HEALTH_FRESHNESS_MS) {
        await verifyEndpoint('solana', network, endpoint);
      }
      const value = await operation(endpoint.url);
      markSuccess('solana', network, endpoint.url, Date.now() - started);
      return value;
    } catch (error) {
      lastError = error;
      markFailure('solana', network, endpoint.url, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All configured Solana RPC endpoints failed');
}

export function getRpcConfigVersion(): number {
  return activeConfig.version;
}

/** Starts a low-frequency, per-device health monitor for the currently used chain. */
export function startRpcHealthMonitoring(chain: RpcChain, network: RpcNetwork): () => void {
  if (monitorTimer) clearInterval(monitorTimer);
  void refreshRpcHealth(chain, network);
  monitorTimer = setInterval(() => {
    void refreshRpcHealth(chain, network);
  }, HEALTH_CHECK_INTERVAL_MS);
  return () => {
    if (monitorTimer) {
      clearInterval(monitorTimer);
      monitorTimer = null;
    }
  };
}
