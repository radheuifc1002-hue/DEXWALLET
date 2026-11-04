import { consumeRateLimit } from './_lib/rate-limit.js';
import { randomUUID } from 'node:crypto';
import { probeRpcProviders, type RpcChain, type RpcNetwork } from './_lib/rpc-manager.js';
import { probeChainRpc } from './_lib/chain-rpc.js';

const CHAINS = new Set<RpcChain>(['ethereum','bnb','polygon','arbitrum','solana','bitcoin','tron']);
const NETWORKS = new Set<RpcNetwork>(['mainnet','testnet']);

export default async function handler(req: any, res: any) {
  const requestId = randomUUID();
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept');
  res.setHeader('X-Request-Id',requestId);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') { res.setHeader('Allow','GET, OPTIONS'); return res.status(405).json({error:{code:'method_not_allowed',requestId}}); }
  const rate=consumeRateLimit(req,'rpc-health',30);
  if(!rate.allowed){res.setHeader('Retry-After',String(Math.max(1,Math.ceil((rate.resetAt-Date.now())/1000))));return res.status(429).json({error:{code:'rate_limit_exceeded',requestId}});}
  const chain = String(req.query?.chain || '').toLowerCase() as RpcChain;
  const network = String(req.query?.network || '').toLowerCase() as RpcNetwork;
  if (!CHAINS.has(chain) || !NETWORKS.has(network)) return res.status(400).json({error:{code:'unsupported_network',requestId}});
  const providers = chain === 'bitcoin' || chain === 'tron'
    ? [await probeChainRpc(chain,network)]
    : await probeRpcProviders(chain,network);
  const healthy=providers.some(provider=>provider.healthy);
  return res.status(healthy?200:503).json({status:healthy?'healthy':providers.length?'degraded':'not_configured',chain,network,providers,requestId,
    note:'Providers are actively probed for this request. Circuit and latency history is local to this serverless function instance.'});
}
