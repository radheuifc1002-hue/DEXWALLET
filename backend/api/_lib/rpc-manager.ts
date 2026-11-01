import { randomUUID } from 'node:crypto';

export type RpcNetwork = 'mainnet' | 'testnet';
export type RpcChain = 'ethereum' | 'bnb' | 'polygon' | 'solana';
type Provider = { name: string; url: string; priority: number };
type ProviderHealth = { failures: number; openUntil: number; latencyMs: number; lastFailure?: string; lastCheckedAt?: number };
type RpcRequest = { jsonrpc: '2.0'; id: string | number | null; method: string; params?: unknown[] };

const NETWORKS: Record<RpcChain, Partial<Record<RpcNetwork,string>>> = {
  ethereum: { mainnet: 'eth-mainnet', testnet: 'eth-sepolia' },
  bnb: { mainnet: 'bnb-mainnet', testnet: 'bnb-testnet' },
  polygon: { mainnet: 'polygon-mainnet', testnet: 'polygon-amoy' },
  solana: { mainnet: 'solana-mainnet', testnet: 'solana-devnet' },
};
const CHAIN_IDS: Partial<Record<RpcChain, Partial<Record<RpcNetwork,number>>>> = {
  ethereum: { mainnet: 1, testnet: 11155111 }, bnb: { mainnet: 56, testnet: 97 },
  polygon: { mainnet: 137, testnet: 80002 },
};
const READ_ONLY_METHODS = new Set([
  'alchemy_getAssetTransfers','eth_chainId','eth_blockNumber','eth_call','eth_estimateGas','eth_gasPrice',
  'eth_maxPriorityFeePerGas','eth_feeHistory','eth_blobBaseFee','eth_getBalance','eth_getBlockByHash',
  'eth_getBlockByNumber','eth_getBlockTransactionCountByHash','eth_getBlockTransactionCountByNumber',
  'eth_getTransactionByBlockHashAndIndex','eth_getTransactionByBlockNumberAndIndex','eth_getCode','eth_getLogs','eth_getStorageAt','eth_getProof',
  'eth_getTransactionByHash','eth_getTransactionCount','eth_getTransactionReceipt','eth_getBlockReceipts',
  'net_version','web3_clientVersion','getAccountInfo','getBalance','getBlock','getFeeForMessage',
  'getBlockHeight','getBlockTime','getEpochInfo','getHealth','getLatestBlockhash',
  'getMinimumBalanceForRentExemption','getMultipleAccounts','getProgramAccounts',
  'getSignatureStatuses','getSignaturesForAddress','getSlot','getTokenAccountBalance','getTokenAccountsByOwner',
  'getTransaction','getVersion',
]);
const SIGNED_BROADCAST_METHODS = new Set(['eth_sendRawTransaction','sendTransaction']);
const REQUEST_TIMEOUT_MS = 18_000;
const MAX_FAILURES = 3;
const BASE_COOLDOWN_MS = 5_000;
const MAX_COOLDOWN_MS = 120_000;
const health = new Map<string, ProviderHealth>();
type RpcCacheEntry={expiresAt:number;body:string};
const rpcCache=new Map<string,RpcCacheEntry>();
const rpcInflight=new Map<string,Promise<RpcProxyResult>>();
const CACHE_TTL:Record<string,number>={'eth_chainId':60_000,'eth_gasPrice':3_000,'eth_getBalance':4_000,'eth_call':4_000,'eth_getCode':30_000,'getBalance':4_000,'getLatestBlockhash':1_000,'getHealth':2_000};
const MAX_CACHE_ENTRIES=10_000;
type ProviderLoad = { active: number; starts: number[] };
const providerLoad = new Map<string, ProviderLoad>();
const MAX_PROVIDER_CONCURRENCY = 24;
const MAX_PROVIDER_REQUESTS_PER_SECOND = 40;
async function acquireProviderSlot(key: string): Promise<() => void> {
  const deadline = Date.now() + 5_000;
  while (true) {
    const now = Date.now();
    const state = providerLoad.get(key) || { active: 0, starts: [] };
    state.starts = state.starts.filter(start => now - start < 1_000);
    if (state.active < MAX_PROVIDER_CONCURRENCY && state.starts.length < MAX_PROVIDER_REQUESTS_PER_SECOND) {
      state.active++;
      state.starts.push(now);
      providerLoad.set(key, state);
      return () => {
        const current = providerLoad.get(key);
        if (current) current.active = Math.max(0, current.active - 1);
      };
    }
    providerLoad.set(key, state);
    if (now >= deadline) throw new Error('provider_capacity_exceeded');
    await sleep(25);
  }
}

function validHttpsUrl(value: string | undefined): value is string {
  if (!value || value.length > 2048) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password; }
  catch { return false; }
}
function providerKey(chain: RpcChain, network: RpcNetwork, p: Provider) { return chain + ':' + network + ':' + p.name + ':' + p.url; }
function getProviders(chain: RpcChain, network: RpcNetwork): Provider[] {
  const networkName = NETWORKS[chain]?.[network];
  if (!networkName) return [];
  const providers: Provider[] = [];
  const scoped = 'ALCHEMY_' + chain.toUpperCase() + '_' + network.toUpperCase() + '_API_KEY';
  const key = process.env[scoped] || process.env.ALCHEMY_API_KEY;
  if (key) providers.push({ name: 'alchemy', url: 'https://' + networkName + '.g.alchemy.com/v2/' + encodeURIComponent(key), priority: 10 });
  if (chain === 'bnb' && network === 'mainnet') {
    const chainstack = process.env.CHAINSTACK_BNB_MAINNET_RPC_URL;
    if (validHttpsUrl(chainstack)) providers.push({ name: 'chainstack', url: chainstack, priority: 20 });
  }
  const fallbackName = 'RPC_FALLBACK_' + chain.toUpperCase() + '_' + network.toUpperCase() + '_URL';
  const fallback = process.env[fallbackName];
  if (validHttpsUrl(fallback)) providers.push({ name: 'configured-fallback', url: fallback, priority: 30 });
  return providers.sort((a,b) => a.priority-b.priority);
}
function retryableHttp(status: number) { return status === 401 || status === 403 || status === 408 || status === 425 || status === 429 || status >= 500; }
function retryableJsonRpc(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  return (Array.isArray(payload) ? payload : [payload]).some((item: any) => {
    const code = Number(item?.error?.code), msg = String(item?.error?.message || '').toLowerCase();
    return code === -32005 || code === -32016 || /rate.?limit|too many requests|over capacity|temporarily unavailable/.test(msg);
  });
}
function retryableNetwork(error: unknown) {
  const e = error as { name?: string; code?: string; message?: string };
  const code = String(e?.code || '').toUpperCase(), msg = String(e?.message || '').toLowerCase();
  return e?.name === 'AbortError' || ['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT'].includes(code) ||
    /fetch failed|socket|connection reset|network error|timed out|provider_capacity_exceeded/.test(msg);
}
function markSuccess(key: string, latencyMs: number) { health.set(key, { failures: 0, openUntil: 0, latencyMs, lastCheckedAt: Date.now() }); }
function markFailure(key: string, error: unknown) {
  const old = health.get(key), failures = (old?.failures || 0) + 1;
  const cooldown = Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * (2 ** Math.min(failures - 1, 5)));
  health.set(key, { failures, openUntil: failures >= MAX_FAILURES ? Date.now() + cooldown : 0,
    latencyMs: old?.latencyMs ?? Number.MAX_SAFE_INTEGER,
    lastFailure: error instanceof Error ? error.message.slice(0,160) : 'upstream failure', lastCheckedAt: Date.now() });
}
function providerSupportsMethods(provider: Provider, methods: string[]): boolean {
  // Alchemy's Transfers API is an Alchemy-specific extension. Never send it
  // to Chainstack or a generic JSON-RPC fallback and mistake "method not found"
  // for an upstream outage.
  if (methods.includes('alchemy_getAssetTransfers')) return provider.name === 'alchemy';
  return true;
}
function orderProviders(chain: RpcChain, network: RpcNetwork, list: Provider[]) {
  const now = Date.now(), usable = list.filter(p => (health.get(providerKey(chain,network,p))?.openUntil || 0) <= now);
  return usable.length ? usable : [...list].sort((a,b) =>
    (health.get(providerKey(chain,network,a))?.openUntil || 0) - (health.get(providerKey(chain,network,b))?.openUntil || 0));
}
function parseBody(body: unknown) {
  let value = body;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  if (!value || typeof value !== 'object') return null;
  const requests = Array.isArray(value) ? value : [value];
  if (!requests.length || requests.length > 100 || requests.some((x:any) =>
    !x || typeof x !== 'object' || x.jsonrpc !== '2.0' || typeof x.method !== 'string' ||
    x.method.length > 128 || (x.params !== undefined && !Array.isArray(x.params)))) return null;
  const allRead = requests.every((x:RpcRequest) => READ_ONLY_METHODS.has(x.method));
  const allSignedBroadcast = requests.every((x:RpcRequest) => SIGNED_BROADCAST_METHODS.has(x.method));
  if (!allRead && !allSignedBroadcast) return null;
  return { serialized: JSON.stringify(value), readOnly: allRead };
}
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve,ms)); }
function jitter(attempt: number) { return Math.floor(Math.random() * Math.min(750,100 * (2 ** Math.max(0,attempt-1)))); }
export type RpcProxyResult = { status:number; body:string; provider:string; requestId:string; attempts:number };
export type RpcProviderStatus = { name:string; configured:boolean; healthy:boolean; circuit:'closed'|'open'; cooldownMs:number; latencyMs:number|null; consecutiveFailures:number; lastCheckedAt:number|null; lastFailure?:string };
async function proxyRpcUncached(chain: RpcChain, network: RpcNetwork, body: unknown): Promise<RpcProxyResult> {
  const requestId = randomUUID(), parsed = parseBody(body);
  if (!parsed || Buffer.byteLength(parsed.serialized,'utf8') > 1_000_000)
    return { status:400, body:JSON.stringify({error:{code:'invalid_json_rpc_request',requestId}}), provider:'none', requestId, attempts:0 };
  const methods = (Array.isArray(body) ? body : [body]).map((item: any) => String(item.method));
  const compatible = getProviders(chain,network).filter(provider => providerSupportsMethods(provider,methods));
  const all = orderProviders(chain,network,compatible), providers = parsed.readOnly ? all : all.slice(0,1);
  if (!providers.length) { console.warn(JSON.stringify({event:'rpc_not_configured',requestId,chain,network,methods})); return { status:503, body:JSON.stringify({error:{code:'rpc_not_configured',requestId}}), provider:'none', requestId, attempts:0 }; }
  let status = 502, responseBody = JSON.stringify({error:{code:'upstream_unavailable',requestId}}), attempts = 0;
  for (const provider of providers) {
    if (attempts) await sleep(jitter(attempts));
    attempts++;
    const key = providerKey(chain,network,provider), controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),REQUEST_TIMEOUT_MS), started = Date.now();
    let release: (() => void) | undefined;
    try {
      release = await acquireProviderSlot(key);
      const response = await fetch(provider.url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:parsed.serialized,signal:controller.signal});
      responseBody = await response.text(); status = response.status;
      if (retryableHttp(status)) { markFailure(key,new Error('HTTP '+status)); console.warn(JSON.stringify({event:'rpc_provider_retry',requestId,chain,network,provider:provider.name,attempt:attempts,status,methods})); if (!parsed.readOnly) break; continue; }
      let json: unknown;
      try { json = JSON.parse(responseBody); } catch { markFailure(key,new Error('Invalid JSON-RPC response')); if (!parsed.readOnly) break; continue; }
      if (retryableJsonRpc(json)) { markFailure(key,new Error('Provider rate limit or capacity response')); console.warn(JSON.stringify({event:'rpc_provider_retry',requestId,chain,network,provider:provider.name,attempt:attempts,status,methods,reason:'provider_capacity'})); if (!parsed.readOnly) break; continue; }
      const latencyMs=Date.now()-started;markSuccess(key,latencyMs);
      console.info(JSON.stringify({event:'rpc_provider_success',requestId,chain,network,provider:provider.name,attempt:attempts,status,latencyMs,methods}));
      return {status,body:responseBody,provider:provider.name,requestId,attempts};
    } catch (error) {
      if (!retryableNetwork(error)) throw error;
      markFailure(key,error); console.warn(JSON.stringify({event:'rpc_provider_failure',requestId,chain,network,provider:provider.name,attempt:attempts,errorType:(error as {name?:string})?.name||'Error',methods})); status = (error as {name?:string})?.name === 'AbortError' ? 504 : 502;
      responseBody = JSON.stringify({error:{code:status===504?'upstream_timeout':'upstream_unavailable',requestId}});
      if (!parsed.readOnly) break;
    } finally { clearTimeout(timeout); release?.(); }
  }
  return {status,body:responseBody,provider:'unavailable',requestId,attempts};
}
function rewriteRpcResponse(body:string,id:unknown,requestId:string):string {
  try {
    const parsed=JSON.parse(body);
    if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
      parsed.id=id??null;
      if(parsed.error&&typeof parsed.error==='object')parsed.error.requestId=requestId;
    }
    return JSON.stringify(parsed);
  } catch { return body; }
}

/**
 * Bounded per-instance response cache and in-flight coalescing for safe,
 * idempotent reads. Transaction submission, nonce, history and signature
 * discovery are never cached. TTLs are deliberately short for changing state.
 */
export async function proxyRpc(chain:RpcChain,network:RpcNetwork,body:unknown):Promise<RpcProxyResult>{
  const parsed=parseBody(body);
  if(!parsed)return proxyRpcUncached(chain,network,body);
  const request=Array.isArray(body)?null:body as RpcRequest;
  const ttl=request&&parsed.readOnly?CACHE_TTL[request.method]||0:0;
  if(!request||!ttl)return proxyRpcUncached(chain,network,body);
  const id=request.id??null,cacheShape={jsonrpc:request.jsonrpc,method:request.method,params:request.params||[]};
  const key=chain+':'+network+':'+JSON.stringify(cacheShape),now=Date.now(),requestId=randomUUID();
  const cached=rpcCache.get(key);
  if(cached&&cached.expiresAt>now)return{status:200,body:rewriteRpcResponse(cached.body,id,requestId),provider:'cache',requestId,attempts:0};
  if(cached)rpcCache.delete(key);
  let pending=rpcInflight.get(key);
  if(!pending){
    pending=proxyRpcUncached(chain,network,body);
    rpcInflight.set(key,pending);
  }
  try{
    const result=await pending;
    if(result.status>=200&&result.status<300){
      rpcCache.set(key,{expiresAt:Date.now()+ttl,body:result.body});
      if(rpcCache.size>MAX_CACHE_ENTRIES){
        const oldest=rpcCache.keys().next().value;
        if(oldest)rpcCache.delete(oldest);
      }
    }
    return{...result,body:rewriteRpcResponse(result.body,id,requestId),requestId};
  }finally{
    if(rpcInflight.get(key)===pending)rpcInflight.delete(key);
  }
}

export function getRpcProviderStatus(chain: RpcChain, network: RpcNetwork): RpcProviderStatus[] {
  return getProviders(chain,network).map(provider => {
    const state = health.get(providerKey(chain,network,provider));
    const checkedRecently=Boolean(state?.lastCheckedAt && Date.now()-state.lastCheckedAt<60_000);
    return { name:provider.name, configured:true, healthy:Boolean(checkedRecently&&state?.failures===0), circuit:(state?.openUntil || 0)>Date.now()?'open':'closed',
      cooldownMs:Math.max(0,(state?.openUntil || 0)-Date.now()),
      latencyMs:state && Number.isFinite(state.latencyMs)?state.latencyMs:null, consecutiveFailures:state?.failures || 0,
      lastCheckedAt:state?.lastCheckedAt??null, ...(state?.lastFailure ? {lastFailure:state.lastFailure} : {}) };
  });
}
export function getRpcChainId(chain: RpcChain, network: RpcNetwork): number | undefined { return CHAIN_IDS[chain]?.[network]; }


/** Actively probes every configured provider for this chain/network. */
export async function probeRpcProviders(chain: RpcChain, network: RpcNetwork): Promise<RpcProviderStatus[]> {
  const providers=getProviders(chain,network);
  await Promise.all(providers.map(async provider=>{
    const key=providerKey(chain,network,provider),controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),6_000),started=Date.now();
    try{
      const method=chain==='solana'?'getHealth':'eth_chainId';
      const response=await fetch(provider.url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',id:'dexwallet-health',method,params:[]}),signal:controller.signal});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const payload=await response.json() as {result?:unknown;error?:unknown};
      if(payload.error||payload.result===undefined)throw new Error('Invalid health response');
      if(chain==='solana'&&payload.result!=='ok')throw new Error('Solana health response was not ok');
      if(chain!=='solana'){
        const expected=getRpcChainId(chain,network),actual=Number(BigInt(String(payload.result)));
        if(expected!==undefined&&actual!==expected)throw new Error('Wrong chain ID '+actual+' (expected '+expected+')');
      }
      markSuccess(key,Date.now()-started);
    }catch(error){markFailure(key,error);}
    finally{clearTimeout(timeout);}
  }));
  return getRpcProviderStatus(chain,network);
}
